// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract EligibilityRegistry is Owned {
    mapping(address => bool) public isEligible;

    event EligibilityUpdated(address indexed account, bool isEligibleForMarkets);

    constructor(address initialOwner) Owned(initialOwner) {}

    function setEligible(address account, bool eligible) external onlyOwner {
        isEligible[account] = eligible;
        emit EligibilityUpdated(account, eligible);
    }
}
