// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DisputeResolution {
    enum DisputeStatus { Opened, ArbitratorAssigned, EvidenceSubmitted, Resolved, Appealed }

    struct Dispute {
        uint256 id;
        address claimant;
        address respondent;
        address arbitrator;
        DisputeStatus status;
        string disputeType;
        string description;
    }

    mapping(uint256 => Dispute) public disputes;
    uint256 public disputeCount;

    event DisputeCreated(uint256 indexed id, address indexed claimant, string disputeType);
    event EvidenceSubmitted(uint256 indexed id, address indexed submittedBy, string description);
    event DisputeResolved(uint256 indexed id, address indexed arbitrator, string outcome);
    event DisputeAppealed(uint256 indexed id, address indexed appellant, string reason);

    function createDispute(string memory _disputeType, string memory _description) external returns (uint256) {
        disputeCount++;
        disputes[disputeCount] = Dispute({
            id: disputeCount,
            claimant: msg.sender,
            respondent: address(0),
            arbitrator: msg.sender,
            status: DisputeStatus.ArbitratorAssigned,
            disputeType: _disputeType,
            description: _description
        });
        emit DisputeCreated(disputeCount, msg.sender, _disputeType);
        return disputeCount;
    }

    function submitEvidence(uint256 _disputeId, string memory _description) external {
        require(_disputeId > 0 && _disputeId <= disputeCount, "Invalid dispute ID");
        emit EvidenceSubmitted(_disputeId, msg.sender, _description);
    }

    function resolveDispute(uint256 _disputeId, string memory _outcome) external {
        require(_disputeId > 0 && _disputeId <= disputeCount, "Invalid dispute ID");
        disputes[_disputeId].status = DisputeStatus.Resolved;
        emit DisputeResolved(_disputeId, msg.sender, _outcome);
    }

    function appealDispute(uint256 _disputeId, string memory _reason) external {
        require(_disputeId > 0 && _disputeId <= disputeCount, "Invalid dispute ID");
        disputes[_disputeId].status = DisputeStatus.Appealed;
        emit DisputeAppealed(_disputeId, msg.sender, _reason);
    }
}
