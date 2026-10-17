// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";

/// @dev A MockERC20 whose `transfer()` always returns false (simulates a
///      token that does not revert but signals failure via the bool return).
///      Used to exercise CutPayEscrow._pay()'s deferred-payout fallback.
contract MockRevertERC20 is MockERC20 {
    constructor() MockERC20("Revert USDC", "rUSDC", 6) {}

    /// @dev Override transfer to always return false without reverting.
    function transfer(address, uint256) external pure override returns (bool) {
        return false;
    }
}
