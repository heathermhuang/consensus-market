// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract EligibilityRegistry is Owned {
    mapping(address => bool) public isEligible;
    mapping(address => bool) public pendingRequests;
    bool public autoApprove;

    event EligibilityUpdated(address indexed account, bool isEligibleForMarkets);
    event AccessRequested(address indexed account);
    event AutoApproveUpdated(bool enabled);

    constructor(address initialOwner) Owned(initialOwner) {}

    /// @notice User requests access. If autoApprove is on, they are immediately eligible.
    function requestAccess() external {
        if (isEligible[msg.sender]) return;

        if (autoApprove) {
            isEligible[msg.sender] = true;
            emit EligibilityUpdated(msg.sender, true);
        } else {
            pendingRequests[msg.sender] = true;
            emit AccessRequested(msg.sender);
        }
    }

    /// @notice Owner approves a pending request.
    function approveRequest(address account) external onlyOwner {
        pendingRequests[account] = false;
        isEligible[account] = true;
        emit EligibilityUpdated(account, true);
    }

    /// @notice Owner batch-approves pending requests.
    function batchApprove(address[] calldata accounts) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            pendingRequests[accounts[i]] = false;
            isEligible[accounts[i]] = true;
            emit EligibilityUpdated(accounts[i], true);
        }
    }

    /// @notice Owner sets eligibility directly (existing behavior preserved).
    function setEligible(address account, bool eligible) external onlyOwner {
        isEligible[account] = eligible;
        emit EligibilityUpdated(account, eligible);
    }

    function setAutoApprove(bool enabled) external onlyOwner {
        autoApprove = enabled;
        emit AutoApproveUpdated(enabled);
    }
}
