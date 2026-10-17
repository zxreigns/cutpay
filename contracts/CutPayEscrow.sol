// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CutPayEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum JobStatus {
        Open,
        Completed,
        Cancelled
    }

    enum MilestoneStatus {
        Pending,
        Submitted,
        Released,
        Refunded,
        Split,
        Disputed
    }

    struct Milestone {
        uint256 amount;
        MilestoneStatus status;
        uint256 submittedAt;
        bytes32 deliverableHash;
        string deliverableURI;
    }

    struct Job {
        uint256 id;
        address client;
        address editor;
        string title;
        uint256 reviewWindow;
        uint256 createdAt;
        uint256 totalFunded;
        uint256 totalReleased;
        JobStatus status;
        Milestone[] milestones;
    }

    struct EditorStats {
        uint256 jobsCompleted;
        uint256 usdcEarned;
        uint256 tipsReceived;
        uint256 onTimeApprovals;
    }

    uint256 public constant MAX_MILESTONES = 20;

    // ── Custom errors ──────────────────────────────────────────────────────────
    error ZeroUsdcAddress();
    error EditorCannotBeClient();
    error ZeroEditorAddress();
    error NoMilestones();
    error TooManyMilestones();
    error ZeroMilestoneAmount();
    error ReviewWindowTooShort();
    error ReviewWindowTooLong();
    error OnlyEditor();
    error OnlyClient();
    error JobNotOpen();
    error InvalidMilestone();
    error MilestoneNotPending();
    error PriorMilestoneIncomplete();
    error MilestoneNotSubmitted();
    error ReviewWindowActive();
    error ReviewWindowPassed();
    error MilestoneNotDisputed();
    error HashMismatch();
    error UriAlreadySet();
    error MilestoneNotReleasable();
    error MilestoneInReview();
    error WorkAlreadyStarted();
    error ZeroTip();
    error JobDoesNotExist();
    error NothingToWithdraw();

    // ── State ──────────────────────────────────────────────────────────────────
    IERC20 public immutable usdc;

    uint256 public jobCount;
    mapping(uint256 => Job) private _jobs;
    mapping(address => uint256[]) private _jobsByClient;
    mapping(address => uint256[]) private _jobsByEditor;
    mapping(address => EditorStats) private _editorStats;
    mapping(address => uint256) public pendingWithdrawals;

    // ── Events ─────────────────────────────────────────────────────────────────
    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed editor,
        uint256 total,
        uint256 milestoneCount
    );
    event MilestoneSubmitted(uint256 indexed jobId, uint256 indexed idx, bytes32 deliverableHash);
    event MilestoneReleased(uint256 indexed jobId, uint256 indexed idx, uint256 amount, bool autoReleased);
    event DisputeOpened(uint256 indexed jobId, uint256 indexed idx);
    event MilestoneSplit(uint256 indexed jobId, uint256 indexed idx, uint256 editorAmount, uint256 clientRefund);
    event DeliverableRevealed(uint256 indexed jobId, uint256 indexed idx, string uri);
    event JobCancelled(uint256 indexed jobId);
    event Tipped(uint256 indexed jobId, address indexed tipper, address indexed editor, uint256 amount);
    /// @notice Emitted when a direct USDC transfer fails and the amount is
    ///         queued for withdrawal instead.
    event PayoutDeferred(address indexed to, uint256 amount);

    // ── Constructor ────────────────────────────────────────────────────────────
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroUsdcAddress();
        usdc = IERC20(_usdc);
    }

    // ── External: job lifecycle ────────────────────────────────────────────────

    function createJob(
        address editor,
        string calldata title,
        uint256[] calldata amounts,
        uint256 reviewWindow
    ) external nonReentrant returns (uint256 jobId) {
        if (editor == msg.sender) revert EditorCannotBeClient();
        if (editor == address(0)) revert ZeroEditorAddress();
        if (amounts.length == 0) revert NoMilestones();
        if (amounts.length > MAX_MILESTONES) revert TooManyMilestones();
        if (reviewWindow < 1 hours) revert ReviewWindowTooShort();
        if (reviewWindow > 30 days) revert ReviewWindowTooLong();

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] == 0) revert ZeroMilestoneAmount();
            total += amounts[i];
        }

        usdc.safeTransferFrom(msg.sender, address(this), total);

        jobCount++;
        jobId = jobCount;

        Job storage job = _jobs[jobId];
        job.id = jobId;
        job.client = msg.sender;
        job.editor = editor;
        job.title = title;
        job.reviewWindow = reviewWindow;
        job.createdAt = block.timestamp;
        job.totalFunded = total;
        job.status = JobStatus.Open;

        for (uint256 i = 0; i < amounts.length; i++) {
            job.milestones.push(
                Milestone({
                    amount: amounts[i],
                    status: MilestoneStatus.Pending,
                    submittedAt: 0,
                    deliverableHash: bytes32(0),
                    deliverableURI: ""
                })
            );
        }

        _jobsByClient[msg.sender].push(jobId);
        _jobsByEditor[editor].push(jobId);

        emit JobCreated(jobId, msg.sender, editor, total, amounts.length);
    }

    function submitMilestone(uint256 jobId, uint256 idx, bytes32 deliverableHash) external nonReentrant {
        Job storage job = _getJob(jobId);

        if (msg.sender != job.editor) revert OnlyEditor();
        if (job.status != JobStatus.Open) revert JobNotOpen();
        if (idx >= job.milestones.length) revert InvalidMilestone();

        Milestone storage milestone = job.milestones[idx];
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneNotPending();

        for (uint256 i = 0; i < idx; i++) {
            MilestoneStatus s = job.milestones[i].status;
            if (s != MilestoneStatus.Released && s != MilestoneStatus.Split) revert PriorMilestoneIncomplete();
        }

        milestone.deliverableHash = deliverableHash;
        milestone.submittedAt = block.timestamp;
        milestone.status = MilestoneStatus.Submitted;

        emit MilestoneSubmitted(jobId, idx, deliverableHash);
    }

    function approveMilestone(uint256 jobId, uint256 idx) external nonReentrant {
        Job storage job = _getJob(jobId);

        if (msg.sender != job.client) revert OnlyClient();
        if (job.status != JobStatus.Open) revert JobNotOpen();
        if (idx >= job.milestones.length) revert InvalidMilestone();

        Milestone storage milestone = job.milestones[idx];
        if (milestone.status != MilestoneStatus.Submitted) revert MilestoneNotSubmitted();

        // ── checks-effects ──
        milestone.status = MilestoneStatus.Released;
        job.totalReleased += milestone.amount;

        EditorStats storage stats = _editorStats[job.editor];
        stats.usdcEarned += milestone.amount;
        stats.onTimeApprovals += 1;

        if (_isJobComplete(job)) {
            job.status = JobStatus.Completed;
            stats.jobsCompleted += 1;
        }

        // ── interaction ──
        _pay(job.editor, milestone.amount);

        emit MilestoneReleased(jobId, idx, milestone.amount, false);
    }

    function claimAutoRelease(uint256 jobId, uint256 idx) external nonReentrant {
        Job storage job = _getJob(jobId);

        if (job.status != JobStatus.Open) revert JobNotOpen();
        if (idx >= job.milestones.length) revert InvalidMilestone();

        Milestone storage milestone = job.milestones[idx];
        if (milestone.status != MilestoneStatus.Submitted) revert MilestoneNotSubmitted();
        if (block.timestamp < milestone.submittedAt + job.reviewWindow) revert ReviewWindowActive();

        // ── checks-effects ──
        milestone.status = MilestoneStatus.Released;
        job.totalReleased += milestone.amount;

        EditorStats storage stats = _editorStats[job.editor];
        stats.usdcEarned += milestone.amount;

        if (_isJobComplete(job)) {
            job.status = JobStatus.Completed;
            stats.jobsCompleted += 1;
        }

        // ── interaction ──
        _pay(job.editor, milestone.amount);

        emit MilestoneReleased(jobId, idx, milestone.amount, true);
    }

    function revealDeliverable(uint256 jobId, uint256 idx, string calldata uri) external {
        Job storage job = _getJob(jobId);

        if (msg.sender != job.editor) revert OnlyEditor();
        if (idx >= job.milestones.length) revert InvalidMilestone();

        Milestone storage milestone = job.milestones[idx];
        if (milestone.status != MilestoneStatus.Released && milestone.status != MilestoneStatus.Split) {
            revert MilestoneNotReleasable();
        }
        if (keccak256(bytes(uri)) != milestone.deliverableHash) revert HashMismatch();
        if (bytes(milestone.deliverableURI).length != 0) revert UriAlreadySet();

        milestone.deliverableURI = uri;

        emit DeliverableRevealed(jobId, idx, uri);
    }

    function openDispute(uint256 jobId, uint256 idx) external nonReentrant {
        Job storage job = _getJob(jobId);

        if (msg.sender != job.client) revert OnlyClient();
        if (job.status != JobStatus.Open) revert JobNotOpen();
        if (idx >= job.milestones.length) revert InvalidMilestone();

        Milestone storage milestone = job.milestones[idx];
        if (milestone.status != MilestoneStatus.Submitted) revert MilestoneNotSubmitted();
        if (block.timestamp >= milestone.submittedAt + job.reviewWindow) revert ReviewWindowPassed();

        milestone.status = MilestoneStatus.Disputed;

        emit DisputeOpened(jobId, idx);
    }

    function acceptSplit(uint256 jobId, uint256 idx) external nonReentrant {
        Job storage job = _getJob(jobId);

        if (msg.sender != job.editor) revert OnlyEditor();
        if (idx >= job.milestones.length) revert InvalidMilestone();

        Milestone storage milestone = job.milestones[idx];
        if (milestone.status != MilestoneStatus.Disputed) revert MilestoneNotDisputed();

        uint256 editorAmount = milestone.amount / 2 + (milestone.amount % 2);
        uint256 clientRefund = milestone.amount - editorAmount;

        // ── checks-effects ──
        milestone.status = MilestoneStatus.Split;
        job.totalReleased += milestone.amount;

        EditorStats storage stats = _editorStats[job.editor];
        stats.usdcEarned += editorAmount;

        if (_isJobComplete(job)) {
            job.status = JobStatus.Completed;
            stats.jobsCompleted += 1;
        }

        // ── interactions ──
        _pay(job.editor, editorAmount);
        _pay(job.client, clientRefund);

        emit MilestoneSplit(jobId, idx, editorAmount, clientRefund);
    }

    function releaseDisputed(uint256 jobId, uint256 idx) external nonReentrant {
        Job storage job = _getJob(jobId);

        if (msg.sender != job.client) revert OnlyClient();
        if (idx >= job.milestones.length) revert InvalidMilestone();

        Milestone storage milestone = job.milestones[idx];
        if (milestone.status != MilestoneStatus.Disputed) revert MilestoneNotDisputed();

        // ── checks-effects ──
        milestone.status = MilestoneStatus.Released;
        job.totalReleased += milestone.amount;

        EditorStats storage stats = _editorStats[job.editor];
        stats.usdcEarned += milestone.amount;

        if (_isJobComplete(job)) {
            job.status = JobStatus.Completed;
            stats.jobsCompleted += 1;
        }

        // ── interaction ──
        _pay(job.editor, milestone.amount);

        emit MilestoneReleased(jobId, idx, milestone.amount, false);
    }

    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage job = _getJob(jobId);

        if (msg.sender != job.client) revert OnlyClient();
        if (job.status != JobStatus.Open) revert JobNotOpen();

        for (uint256 i = 0; i < job.milestones.length; i++) {
            MilestoneStatus s = job.milestones[i].status;
            if (s == MilestoneStatus.Submitted || s == MilestoneStatus.Disputed) revert MilestoneInReview();
        }

        // ── checks-effects ──
        job.status = JobStatus.Cancelled;

        // ── interactions ──
        for (uint256 i = 0; i < job.milestones.length; i++) {
            Milestone storage milestone = job.milestones[i];
            if (milestone.status == MilestoneStatus.Pending) {
                milestone.status = MilestoneStatus.Refunded;
                _pay(job.client, milestone.amount);
            }
        }

        emit JobCancelled(jobId);
    }

    function declineJob(uint256 jobId) external nonReentrant {
        Job storage job = _getJob(jobId);

        if (msg.sender != job.editor) revert OnlyEditor();
        if (job.status != JobStatus.Open) revert JobNotOpen();

        for (uint256 i = 0; i < job.milestones.length; i++) {
            MilestoneStatus s = job.milestones[i].status;
            if (s != MilestoneStatus.Pending) revert WorkAlreadyStarted();
        }

        // ── checks-effects ──
        job.status = JobStatus.Cancelled;

        // ── interactions ──
        for (uint256 i = 0; i < job.milestones.length; i++) {
            Milestone storage milestone = job.milestones[i];
            milestone.status = MilestoneStatus.Refunded;
            _pay(job.client, milestone.amount);
        }

        emit JobCancelled(jobId);
    }

    /// @notice Send a tip directly from the tipper to the editor.
    ///         Tips bypass escrow and flow tipper → contract → editor in one tx.
    function tip(uint256 jobId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroTip();
        Job storage job = _getJob(jobId);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        usdc.safeTransfer(job.editor, amount);

        _editorStats[job.editor].tipsReceived += amount;

        emit Tipped(jobId, msg.sender, job.editor, amount);
    }

    /// @notice Withdraw any USDC queued via the fallback path.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
    }

    // ── External: views ────────────────────────────────────────────────────────

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _getJob(jobId);
    }

    function jobsByClient(address client) external view returns (uint256[] memory) {
        return _jobsByClient[client];
    }

    function jobsByEditor(address editor) external view returns (uint256[] memory) {
        return _jobsByEditor[editor];
    }

    function editorStats(address editor) external view returns (EditorStats memory) {
        return _editorStats[editor];
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// @dev Try a direct USDC transfer. If it fails for any reason (e.g.
    ///      blocklisted recipient on Arc), credit pendingWithdrawals instead
    ///      so funds are never permanently locked.
    ///
    ///      Uses a low-level call to handle both:
    ///        (a) tokens that return `bool`  — USDC complies, returns true/false
    ///        (b) tokens that return nothing — rare but handled via data.length == 0
    ///
    ///      This function MUST be called AFTER all state changes (checks-effects-
    ///      interactions). nonReentrant on every caller ensures safety even though
    ///      _pay itself is internal.
    function _pay(address to, uint256 amount) internal {
        // Build the call data for IERC20.transfer(to, amount)
        (bool success, bytes memory data) = address(usdc).call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );

        bool transferred = success && (data.length == 0 || abi.decode(data, (bool)));

        if (transferred) {
            // Fast path: funds are already in the recipient's wallet.
            return;
        }

        // Fallback path: queue for pull-withdrawal and signal the deferral.
        pendingWithdrawals[to] += amount;
        emit PayoutDeferred(to, amount);
    }

    function _isJobComplete(Job storage job) internal view returns (bool) {
        for (uint256 i = 0; i < job.milestones.length; i++) {
            MilestoneStatus s = job.milestones[i].status;
            if (s != MilestoneStatus.Released && s != MilestoneStatus.Split) {
                return false;
            }
        }
        return true;
    }

    function _getJob(uint256 jobId) internal view returns (Job storage job) {
        if (jobId == 0 || jobId > jobCount) revert JobDoesNotExist();
        job = _jobs[jobId];
    }
}
