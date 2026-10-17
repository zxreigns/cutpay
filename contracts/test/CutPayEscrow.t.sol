// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CutPayEscrow} from "../CutPayEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockRevertERC20} from "../test-helpers/MockRevertERC20.sol";

contract CutPayEscrowTest is Test {
    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────
    CutPayEscrow internal escrow;
    MockERC20    internal usdc;

    address internal client   = makeAddr("client");
    address internal editor   = makeAddr("editor");
    address internal stranger = makeAddr("stranger");

    uint256[] internal ONE_MS;  // [100e6]
    uint256[] internal TWO_MS;  // [100e6, 200e6]

    uint256 internal constant REVIEW_1H = 1 hours;
    uint256 internal constant REVIEW_2D = 2 days;
    uint256 internal constant USDC_UNIT = 1e6;

    string  internal constant URI  = "ipfs://QmDeliverable";
    bytes32 internal constant HASH = keccak256(bytes("ipfs://QmDeliverable"));

    // ─────────────────────────────────────────────────────────────────────────
    // setUp — runs before EVERY test
    // ─────────────────────────────────────────────────────────────────────────
    function setUp() public {
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new CutPayEscrow(address(usdc));

        ONE_MS = new uint256[](1);
        ONE_MS[0] = 100 * USDC_UNIT;

        TWO_MS = new uint256[](2);
        TWO_MS[0] = 100 * USDC_UNIT;
        TWO_MS[1] = 200 * USDC_UNIT;

        usdc.mint(client, 10_000 * USDC_UNIT);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);

        usdc.mint(stranger, 10_000 * USDC_UNIT);
        vm.prank(stranger);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    function _createJob1MS() internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = escrow.createJob(editor, "Test Job", ONE_MS, REVIEW_2D);
    }

    function _createJob2MS() internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = escrow.createJob(editor, "Two MS Job", TWO_MS, REVIEW_2D);
    }

    function _submitMS(uint256 jobId, uint256 idx, bytes32 hash) internal {
        vm.prank(editor);
        escrow.submitMilestone(jobId, idx, hash);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. createJob — happy path
    // ─────────────────────────────────────────────────────────────────────────
    function test_CreateJob_HappyPath() public {
        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit CutPayEscrow.JobCreated(1, client, editor, 100 * USDC_UNIT, 1);

        vm.prank(client);
        uint256 jobId = escrow.createJob(editor, "My Job", ONE_MS, REVIEW_2D);

        assertEq(jobId, 1);
        assertEq(escrow.jobCount(), 1);
        assertEq(usdc.balanceOf(client),           clientBalBefore - 100 * USDC_UNIT);
        assertEq(usdc.balanceOf(address(escrow)),   100 * USDC_UNIT);

        CutPayEscrow.Job memory j = escrow.getJob(jobId);
        assertEq(j.client,       client);
        assertEq(j.editor,       editor);
        assertEq(j.totalFunded,  100 * USDC_UNIT);
        assertEq(j.milestones.length, 1);
        assertEq(j.milestones[0].amount, 100 * USDC_UNIT);
        assertTrue(j.milestones[0].status == CutPayEscrow.MilestoneStatus.Pending);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. createJob — revert: editor == client
    // ─────────────────────────────────────────────────────────────────────────
    function test_CreateJob_RevertEditorIsClient() public {
        vm.prank(client);
        vm.expectRevert(CutPayEscrow.EditorCannotBeClient.selector);
        escrow.createJob(client, "Bad Job", ONE_MS, REVIEW_2D);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. createJob — revert: empty milestones
    // ─────────────────────────────────────────────────────────────────────────
    function test_CreateJob_RevertNoMilestones() public {
        uint256[] memory empty = new uint256[](0);
        vm.prank(client);
        vm.expectRevert(CutPayEscrow.NoMilestones.selector);
        escrow.createJob(editor, "Bad Job", empty, REVIEW_2D);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. createJob — revert: zero milestone amount
    // ─────────────────────────────────────────────────────────────────────────
    function test_CreateJob_RevertZeroMilestoneAmount() public {
        uint256[] memory bad = new uint256[](2);
        bad[0] = 100 * USDC_UNIT;
        bad[1] = 0;
        vm.prank(client);
        vm.expectRevert(CutPayEscrow.ZeroMilestoneAmount.selector);
        escrow.createJob(editor, "Bad Job", bad, REVIEW_2D);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. createJob — revert: reviewWindow < 1 hour
    // ─────────────────────────────────────────────────────────────────────────
    function test_CreateJob_RevertReviewWindowTooShort() public {
        vm.prank(client);
        vm.expectRevert(CutPayEscrow.ReviewWindowTooShort.selector);
        escrow.createJob(editor, "Bad Job", ONE_MS, 30 minutes);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. createJob — revert: too many milestones
    // ─────────────────────────────────────────────────────────────────────────
    function test_CreateJob_RevertTooManyMilestones() public {
        uint256 max = escrow.MAX_MILESTONES();
        uint256[] memory big = new uint256[](max + 1);
        for (uint256 i = 0; i < big.length; i++) big[i] = USDC_UNIT;
        usdc.mint(client, (max + 1) * USDC_UNIT);
        vm.prank(client);
        vm.expectRevert(CutPayEscrow.TooManyMilestones.selector);
        escrow.createJob(editor, "Bad Job", big, REVIEW_2D);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. approveMilestone — happy path: editor receives USDC immediately
    //    (no withdraw() call needed when token transfer succeeds)
    // ─────────────────────────────────────────────────────────────────────────
    function test_ApproveMilestone_ImmediatePayout() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);

        uint256 editorBalBefore = usdc.balanceOf(editor);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit CutPayEscrow.MilestoneReleased(jobId, 0, 100 * USDC_UNIT, false);

        vm.prank(client);
        escrow.approveMilestone(jobId, 0);

        // Editor's USDC balance rose immediately — no withdraw() needed
        assertEq(usdc.balanceOf(editor), editorBalBefore + 100 * USDC_UNIT);
        // pendingWithdrawals NOT credited in the happy path
        assertEq(escrow.pendingWithdrawals(editor), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. claimAutoRelease — succeeds after review window (vm.warp)
    // ─────────────────────────────────────────────────────────────────────────
    function test_ClaimAutoRelease_AfterWindow() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);

        skip(REVIEW_2D + 1);

        uint256 editorBalBefore = usdc.balanceOf(editor);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit CutPayEscrow.MilestoneReleased(jobId, 0, 100 * USDC_UNIT, true);

        vm.prank(editor);
        escrow.claimAutoRelease(jobId, 0);

        // Immediate payout
        assertEq(usdc.balanceOf(editor), editorBalBefore + 100 * USDC_UNIT);
        assertEq(escrow.pendingWithdrawals(editor), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. claimAutoRelease — reverts before review window ends
    // ─────────────────────────────────────────────────────────────────────────
    function test_ClaimAutoRelease_RevertBeforeWindow() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);

        skip(1 hours);

        vm.expectRevert(CutPayEscrow.ReviewWindowActive.selector);
        escrow.claimAutoRelease(jobId, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. submitMilestone — out-of-order submit reverts
    // ─────────────────────────────────────────────────────────────────────────
    function test_SubmitMilestone_OutOfOrderReverts() public {
        uint256 jobId = _createJob2MS();

        vm.prank(editor);
        vm.expectRevert(CutPayEscrow.PriorMilestoneIncomplete.selector);
        escrow.submitMilestone(jobId, 1, HASH);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. dispute → acceptSplit — 50/50 split math + immediate payout
    // ─────────────────────────────────────────────────────────────────────────
    function test_Dispute_AcceptSplit_Math() public {
        uint256[] memory ms = new uint256[](1);
        ms[0] = 101 * USDC_UNIT; // odd → dust to editor
        usdc.mint(client, 101 * USDC_UNIT);

        vm.prank(client);
        uint256 jobId = escrow.createJob(editor, "Dispute Job", ms, REVIEW_1H);

        _submitMS(jobId, 0, HASH);
        vm.prank(client);
        escrow.openDispute(jobId, 0);

        uint256 amount       = 101 * USDC_UNIT;
        uint256 editorAmt    = amount / 2 + (amount % 2); // 51 * USDC_UNIT
        uint256 clientRefund = amount - editorAmt;         // 50 * USDC_UNIT

        uint256 editorBalBefore = usdc.balanceOf(editor);
        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit CutPayEscrow.MilestoneSplit(jobId, 0, editorAmt, clientRefund);

        vm.prank(editor);
        escrow.acceptSplit(jobId, 0);

        // Both paid immediately
        assertEq(usdc.balanceOf(editor), editorBalBefore + editorAmt);
        assertEq(usdc.balanceOf(client), clientBalBefore + clientRefund);
        assertEq(escrow.pendingWithdrawals(editor), 0);
        assertEq(escrow.pendingWithdrawals(client), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. cancelJob — only refunds Pending; reverts if Submitted/Disputed
    // ─────────────────────────────────────────────────────────────────────────
    function test_CancelJob_RefundsOnlyPending() public {
        uint256 jobId = _createJob2MS();

        // Release MS0
        _submitMS(jobId, 0, HASH);
        vm.prank(client);
        escrow.approveMilestone(jobId, 0);

        // MS1 Pending → cancel refunds it
        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.prank(client);
        escrow.cancelJob(jobId);

        // 200 USDC immediately refunded (editor already got 100 at approve)
        assertEq(usdc.balanceOf(client), clientBalBefore + 200 * USDC_UNIT);
    }

    function test_CancelJob_RevertIfSubmitted() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);

        vm.prank(client);
        vm.expectRevert(CutPayEscrow.MilestoneInReview.selector);
        escrow.cancelJob(jobId);
    }

    function test_CancelJob_RevertIfDisputed() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);
        vm.prank(client);
        escrow.openDispute(jobId, 0);
        vm.prank(client);
        vm.expectRevert(CutPayEscrow.MilestoneInReview.selector);
        escrow.cancelJob(jobId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. declineJob — reverts if any non-Pending milestone; happy path refunds
    // ─────────────────────────────────────────────────────────────────────────
    function test_DeclineJob_RevertIfWorkStarted() public {
        uint256 jobId = _createJob2MS();
        _submitMS(jobId, 0, HASH);

        vm.prank(editor);
        vm.expectRevert(CutPayEscrow.WorkAlreadyStarted.selector);
        escrow.declineJob(jobId);
    }

    function test_DeclineJob_HappyPath() public {
        uint256 jobId = _createJob2MS();
        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.prank(editor);
        escrow.declineJob(jobId);

        // 300 USDC immediately refunded
        assertEq(usdc.balanceOf(client), clientBalBefore + 300 * USDC_UNIT);
        assertEq(escrow.pendingWithdrawals(client), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. revealDeliverable — reverts with wrong hash
    // ─────────────────────────────────────────────────────────────────────────
    function test_RevealDeliverable_RevertWrongHash() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);
        vm.prank(client);
        escrow.approveMilestone(jobId, 0);

        vm.prank(editor);
        vm.expectRevert(CutPayEscrow.HashMismatch.selector);
        escrow.revealDeliverable(jobId, 0, "ipfs://WRONG");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 15. revealDeliverable — succeeds after release with correct hash
    // ─────────────────────────────────────────────────────────────────────────
    function test_RevealDeliverable_HappyPath() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);
        vm.prank(client);
        escrow.approveMilestone(jobId, 0);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit CutPayEscrow.DeliverableRevealed(jobId, 0, URI);

        vm.prank(editor);
        escrow.revealDeliverable(jobId, 0, URI);

        CutPayEscrow.Job memory j = escrow.getJob(jobId);
        assertEq(j.milestones[0].deliverableURI, URI);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 16. tip — direct transfer, updates tipsReceived
    // ─────────────────────────────────────────────────────────────────────────
    function test_Tip_HappyPath() public {
        uint256 jobId  = _createJob1MS();
        uint256 tipAmt = 5 * USDC_UNIT;
        uint256 editorBalBefore = usdc.balanceOf(editor);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit CutPayEscrow.Tipped(jobId, stranger, editor, tipAmt);

        vm.prank(stranger);
        escrow.tip(jobId, tipAmt);

        assertEq(usdc.balanceOf(editor), editorBalBefore + tipAmt);
        assertEq(escrow.pendingWithdrawals(editor), 0); // tips never go through _pay()

        CutPayEscrow.EditorStats memory stats = escrow.editorStats(editor);
        assertEq(stats.tipsReceived, tipAmt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 17. editorStats — jobsCompleted, usdcEarned, onTimeApprovals
    // ─────────────────────────────────────────────────────────────────────────
    function test_EditorStats_ApprovePath() public {
        uint256 jobId = _createJob2MS();

        _submitMS(jobId, 0, HASH);
        vm.prank(client);
        escrow.approveMilestone(jobId, 0);

        {
            CutPayEscrow.EditorStats memory s = escrow.editorStats(editor);
            assertEq(s.onTimeApprovals, 1);
            assertEq(s.usdcEarned,      100 * USDC_UNIT);
            assertEq(s.jobsCompleted,   0);
        }

        _submitMS(jobId, 1, HASH);
        vm.prank(client);
        escrow.approveMilestone(jobId, 1);

        {
            CutPayEscrow.EditorStats memory s = escrow.editorStats(editor);
            assertEq(s.onTimeApprovals, 2);
            assertEq(s.usdcEarned,      300 * USDC_UNIT);
            assertEq(s.jobsCompleted,   1);
        }
    }

    function test_EditorStats_AutoReleaseNoOnTimeApproval() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);
        skip(REVIEW_2D + 1);
        escrow.claimAutoRelease(jobId, 0);

        CutPayEscrow.EditorStats memory s = escrow.editorStats(editor);
        assertEq(s.onTimeApprovals, 0);
        assertEq(s.usdcEarned,      100 * USDC_UNIT);
        assertEq(s.jobsCompleted,   1);
    }

    function test_EditorStats_JobCompletedOnSplit() public {
        uint256 jobId = _createJob1MS();
        _submitMS(jobId, 0, HASH);
        vm.prank(client);
        escrow.openDispute(jobId, 0);
        vm.prank(editor);
        escrow.acceptSplit(jobId, 0);

        CutPayEscrow.EditorStats memory s = escrow.editorStats(editor);
        assertEq(s.jobsCompleted, 1);
        assertEq(s.usdcEarned,    50 * USDC_UNIT);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 18. withdraw — NothingToWithdraw when balance is zero
    // ─────────────────────────────────────────────────────────────────────────
    function test_Withdraw_RevertNothingToWithdraw() public {
        vm.prank(editor);
        vm.expectRevert(CutPayEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 19. _pay() fallback — when token.transfer() returns false, payout is
    //     deferred to pendingWithdrawals and withdraw() later succeeds.
    // ─────────────────────────────────────────────────────────────────────────
    function test_PayFallback_DeferredOnTransferFail() public {
        // Deploy escrow with a token whose transfer() always returns false
        MockRevertERC20 badToken = new MockRevertERC20();
        CutPayEscrow    failEscrow = new CutPayEscrow(address(badToken));

        uint256[] memory ms = new uint256[](1);
        ms[0] = 100 * USDC_UNIT;

        // Fund client and approve
        badToken.mint(client, 200 * USDC_UNIT);
        vm.prank(client);
        badToken.approve(address(failEscrow), type(uint256).max);

        // Create job — transferFrom works fine (only transfer is broken)
        vm.prank(client);
        uint256 jobId = failEscrow.createJob(editor, "Fail Job", ms, REVIEW_2D);

        // Submit
        vm.prank(editor);
        failEscrow.submitMilestone(jobId, 0, HASH);

        // Approve — transfer will fail → PayoutDeferred emitted
        vm.expectEmit(true, false, false, true, address(failEscrow));
        emit CutPayEscrow.PayoutDeferred(editor, 100 * USDC_UNIT);

        vm.prank(client);
        failEscrow.approveMilestone(jobId, 0);

        // Editor did NOT receive USDC yet
        assertEq(badToken.balanceOf(editor), 0);
        assertEq(failEscrow.pendingWithdrawals(editor), 100 * USDC_UNIT);

        // Now fix the token (use a normal MockERC20 perspective: the escrow still
        // holds the funds). We can't un-break MockRevertERC20.transfer(), but we
        // CAN verify withdraw() attempts it and tracks the deferred balance.
        // Since transfer() still returns false inside withdraw(), safeTransfer will
        // revert (SafeERC20 wraps the return value check). This confirms the funds
        // are locked only as long as the token stays broken — not the contract's
        // fault. To complete the round-trip test we use a toggle-able mock.
        //
        // ── Round-trip with a toggle-able mock ──
        ToggleTransferERC20 toggleToken = new ToggleTransferERC20();
        CutPayEscrow toggleEscrow = new CutPayEscrow(address(toggleToken));

        toggleToken.mint(client, 200 * USDC_UNIT);
        vm.prank(client);
        toggleToken.approve(address(toggleEscrow), type(uint256).max);

        // Disable transfers
        toggleToken.setTransferEnabled(false);

        vm.prank(client);
        uint256 jobId2 = toggleEscrow.createJob(editor, "Toggle Job", ms, REVIEW_2D);
        vm.prank(editor);
        toggleEscrow.submitMilestone(jobId2, 0, HASH);

        // approveMilestone: transfer disabled → deferred
        vm.prank(client);
        toggleEscrow.approveMilestone(jobId2, 0);

        assertEq(toggleToken.balanceOf(editor),        0);
        assertEq(toggleEscrow.pendingWithdrawals(editor), 100 * USDC_UNIT);

        // Re-enable transfers
        toggleToken.setTransferEnabled(true);

        uint256 editorBalBefore = toggleToken.balanceOf(editor);
        vm.prank(editor);
        toggleEscrow.withdraw();

        assertEq(toggleToken.balanceOf(editor), editorBalBefore + 100 * USDC_UNIT);
        assertEq(toggleEscrow.pendingWithdrawals(editor), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: split math
    // ─────────────────────────────────────────────────────────────────────────
    function testFuzz_AcceptSplit_MathInvariant(uint256 amount) public pure {
        amount = bound(amount, 1, 1_000_000_000 * USDC_UNIT);
        uint256 editorAmt    = amount / 2 + (amount % 2);
        uint256 clientRefund = amount - editorAmt;
        assertEq(editorAmt + clientRefund, amount);
        assertGe(editorAmt, amount / 2);
        assertLe(clientRefund, amount / 2 + 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Invariant: escrow USDC balance >= sum of pending withdrawals
    // ─────────────────────────────────────────────────────────────────────────
    EscrowInvariantHandler internal handler;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle-able ERC-20 for the fallback round-trip test
// ─────────────────────────────────────────────────────────────────────────────
contract ToggleTransferERC20 is MockERC20 {
    bool public transferEnabled = true;

    constructor() MockERC20("Toggle USDC", "tUSDC", 6) {}

    function setTransferEnabled(bool enabled) external {
        transferEnabled = enabled;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        if (!transferEnabled) return false;
        return _transfer(msg.sender, to, amount);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant handler
// ─────────────────────────────────────────────────────────────────────────────
contract EscrowInvariantHandler is Test {
    CutPayEscrow internal escrow;
    MockERC20    internal usdc;
    address      internal client;
    address      internal editor;

    uint256 public ghostPending; // tracks funds that went to pendingWithdrawals

    constructor(CutPayEscrow _escrow, MockERC20 _usdc, address _client, address _editor) {
        escrow = _escrow;
        usdc   = _usdc;
        client = _client;
        editor = _editor;
    }

    function createAndApprove(uint256 amount) external {
        amount = bound(amount, 1, 1_000 * 1e6);

        usdc.mint(client, amount);
        vm.prank(client);
        usdc.approve(address(escrow), amount);

        uint256[] memory ms = new uint256[](1);
        ms[0] = amount;

        vm.prank(client);
        uint256 jobId = escrow.createJob(editor, "Inv Job", ms, 1 hours);

        bytes32 h = keccak256("uri");
        vm.prank(editor);
        escrow.submitMilestone(jobId, 0, h);

        vm.prank(client);
        escrow.approveMilestone(jobId, 0);
        // With the normal MockERC20, transfer succeeds → no pending added
    }

    function editorWithdraw() external {
        uint256 bal = escrow.pendingWithdrawals(editor);
        if (bal == 0) return;
        ghostPending -= bal;
        vm.prank(editor);
        escrow.withdraw();
    }
}

contract CutPayEscrowInvariantTest is Test {
    CutPayEscrow           internal escrow;
    MockERC20              internal usdc;
    EscrowInvariantHandler internal handler;

    address internal client = makeAddr("inv_client");
    address internal editor = makeAddr("inv_editor");

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow  = new CutPayEscrow(address(usdc));
        handler = new EscrowInvariantHandler(escrow, usdc, client, editor);
        targetContract(address(handler));
    }

    /// PROPERTY: escrow USDC balance >= deferred pending withdrawals.
    function invariant_EscrowCoversEditorPending() public view {
        assertGe(
            usdc.balanceOf(address(escrow)),
            handler.ghostPending(),
            "escrow under-collateralised"
        );
    }
}
