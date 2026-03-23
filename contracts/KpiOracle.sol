// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract KpiOracle is Owned {
    uint256 private constant SECP256K1N_DIV_2 =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("PRED KPI Oracle");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant RESOLUTION_TYPEHASH =
        keccak256(
            "ResolutionPayload(bytes32 marketId,int256 actualValue,bytes32 sourceHash,string sourceUri,uint64 observedAt,uint64 validAfter,uint64 validBefore,uint256 nonce)"
        );

    struct ResolutionPayload {
        bytes32 marketId;
        int256 actualValue;
        bytes32 sourceHash;
        string sourceUri;
        uint64 observedAt;
        uint64 validAfter;
        uint64 validBefore;
        uint256 nonce;
    }

    struct Resolution {
        bool resolved;
        int256 actualValue;
        uint64 resolvedAt;
        uint64 observedAt;
        bytes32 sourceHash;
        bytes32 attestationDigest;
        address signer;
        string sourceUri;
    }

    mapping(address => bool) public authorizedReporters;
    mapping(address => bool) public authorizedSigners;
    mapping(bytes32 => bool) public usedAttestations;
    mapping(bytes32 => Resolution) private resolutions;
    /// @notice Pre-lock commit hashes: marketId => EIP-712 digest committed by an authorized signer.
    ///         When non-zero, publishSignedResolution MUST present a payload whose digest matches.
    mapping(bytes32 => bytes32) public resolutionCommits;

    event ReporterUpdated(address indexed reporter, bool authorized);
    event SignerUpdated(address indexed signer, bool authorized);
    event MarketResolved(
        bytes32 indexed marketId,
        int256 actualValue,
        bytes32 indexed sourceHash,
        string sourceUri,
        uint64 resolvedAt
    );
    event SignedResolutionAccepted(bytes32 indexed marketId, address indexed signer, bytes32 indexed attestationDigest);
    event ResolutionCommitted(bytes32 indexed marketId, bytes32 indexed payloadDigest, address indexed committer);

    error NotAuthorizedReporter();
    error NotAuthorizedSigner();
    error ResolutionAlreadyPublished();
    error AttestationAlreadyUsed();
    error AttestationTooEarly();
    error AttestationExpired();
    error InvalidSignature();
    error CommitMismatch();

    constructor(address initialOwner) Owned(initialOwner) {}

    modifier onlyReporter() {
        if (msg.sender != owner && !authorizedReporters[msg.sender]) {
            revert NotAuthorizedReporter();
        }
        _;
    }

    /// @notice Commit an EIP-712 payload digest before market lock so the actual resolution
    ///         value remains hidden on-chain until reveal. Optional but auditable: if a commit
    ///         exists for a marketId, publishSignedResolution will revert unless the payload
    ///         digest matches exactly.
    /// @param marketId  The market being committed.
    /// @param payloadDigest  EIP-712 digest of the ResolutionPayload (from hashResolutionPayload).
    function commitResolution(bytes32 marketId, bytes32 payloadDigest) external {
        if (msg.sender != owner && !authorizedSigners[msg.sender]) revert NotAuthorizedSigner();
        resolutionCommits[marketId] = payloadDigest;
        emit ResolutionCommitted(marketId, payloadDigest, msg.sender);
    }

    function setReporter(address reporter, bool authorized) external onlyOwner {
        authorizedReporters[reporter] = authorized;
        emit ReporterUpdated(reporter, authorized);
    }

    function setSigner(address signer, bool authorized) external onlyOwner {
        authorizedSigners[signer] = authorized;
        emit SignerUpdated(signer, authorized);
    }

    function publishResolution(
        bytes32 marketId,
        int256 actualValue,
        bytes32 sourceHash,
        string calldata sourceUri
    ) external onlyReporter {
        _storeResolution(
            marketId,
            actualValue,
            uint64(block.timestamp),
            sourceHash,
            sourceUri,
            bytes32(0),
            msg.sender
        );
    }

    function publishSignedResolution(
        ResolutionPayload calldata payload,
        bytes calldata signature
    ) external returns (address signer, bytes32 digest) {
        if (payload.validAfter != 0 && block.timestamp < payload.validAfter) revert AttestationTooEarly();
        if (payload.validBefore != 0 && block.timestamp > payload.validBefore) revert AttestationExpired();

        digest = hashResolutionPayload(payload);
        if (usedAttestations[digest]) revert AttestationAlreadyUsed();

        // If the signer pre-committed a digest for this market, the payload must match.
        bytes32 committed = resolutionCommits[payload.marketId];
        if (committed != bytes32(0) && committed != digest) revert CommitMismatch();

        signer = _recoverSigner(digest, signature);
        if (signer != owner && !authorizedSigners[signer]) revert NotAuthorizedSigner();

        usedAttestations[digest] = true;

        _storeResolution(
            payload.marketId,
            payload.actualValue,
            payload.observedAt,
            payload.sourceHash,
            payload.sourceUri,
            digest,
            signer
        );

        emit SignedResolutionAccepted(payload.marketId, signer, digest);
    }

    function hashResolutionPayload(ResolutionPayload calldata payload) public view returns (bytes32) {
        bytes32 structHash =
            keccak256(
                abi.encode(
                    RESOLUTION_TYPEHASH,
                    payload.marketId,
                    payload.actualValue,
                    payload.sourceHash,
                    keccak256(bytes(payload.sourceUri)),
                    payload.observedAt,
                    payload.validAfter,
                    payload.validBefore,
                    payload.nonce
                )
            );

        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function getResolution(
        bytes32 marketId
    )
        external
        view
        returns (
            bool resolved,
            int256 actualValue,
            uint64 resolvedAt,
            uint64 observedAt,
            bytes32 sourceHash,
            bytes32 attestationDigest,
            address signer,
            string memory sourceUri
        )
    {
        Resolution storage resolution = resolutions[marketId];
        return
        (
            resolution.resolved,
            resolution.actualValue,
            resolution.resolvedAt,
            resolution.observedAt,
            resolution.sourceHash,
            resolution.attestationDigest,
            resolution.signer,
            resolution.sourceUri
        );
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        if (v < 27) {
            v += 27;
        }
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > SECP256K1N_DIV_2) revert InvalidSignature();

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }

    function _storeResolution(
        bytes32 marketId,
        int256 actualValue,
        uint64 observedAt,
        bytes32 sourceHash,
        string calldata sourceUri,
        bytes32 attestationDigest,
        address signer
    ) internal {
        Resolution storage resolution = resolutions[marketId];
        if (resolution.resolved) revert ResolutionAlreadyPublished();

        resolution.resolved = true;
        resolution.actualValue = actualValue;
        resolution.resolvedAt = uint64(block.timestamp);
        resolution.observedAt = observedAt;
        resolution.sourceHash = sourceHash;
        resolution.attestationDigest = attestationDigest;
        resolution.signer = signer;
        resolution.sourceUri = sourceUri;

        emit MarketResolved(marketId, actualValue, sourceHash, sourceUri, uint64(block.timestamp));
    }
}
