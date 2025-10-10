// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PolicyDeliberationPlatformFHE is SepoliaConfig {
    struct EncryptedDraft {
        uint256 id;
        euint32 encryptedTitle;    // Encrypted policy title
        euint32 encryptedContent;  // Encrypted policy content
        euint32 encryptedCategory; // Encrypted policy category
        uint256 timestamp;
    }
    
    struct EncryptedSuggestion {
        uint256 draftId;
        euint32 encryptedSuggestion; // Encrypted suggestion content
        uint256 timestamp;
    }
    
    struct DecryptedDraft {
        string title;
        string content;
        string category;
        bool isRevealed;
    }

    // Contract state
    uint256 public draftCount;
    uint256 public suggestionCount;
    mapping(uint256 => EncryptedDraft) public encryptedDrafts;
    mapping(uint256 => EncryptedSuggestion) public encryptedSuggestions;
    mapping(uint256 => DecryptedDraft) public decryptedDrafts;
    
    // Aggregated suggestions per draft
    mapping(uint256 => euint32) public aggregatedSuggestions;
    
    // Decryption requests tracking
    mapping(uint256 => uint256) private requestToDraftId;
    mapping(uint256 => uint256) private requestToSuggestionId;
    
    // Events
    event DraftSubmitted(uint256 indexed id, uint256 timestamp);
    event SuggestionAdded(uint256 indexed draftId, uint256 suggestionId);
    event AggregationCompleted(uint256 indexed draftId);
    event DraftDecrypted(uint256 indexed id);
    event SuggestionDecrypted(uint256 indexed id);

    /// @notice Submit a new encrypted policy draft
    function submitEncryptedDraft(
        euint32 encryptedTitle,
        euint32 encryptedContent,
        euint32 encryptedCategory
    ) public {
        draftCount += 1;
        uint256 newId = draftCount;
        
        encryptedDrafts[newId] = EncryptedDraft({
            id: newId,
            encryptedTitle: encryptedTitle,
            encryptedContent: encryptedContent,
            encryptedCategory: encryptedCategory,
            timestamp: block.timestamp
        });
        
        decryptedDrafts[newId] = DecryptedDraft({
            title: "",
            content: "",
            category: "",
            isRevealed: false
        });
        
        emit DraftSubmitted(newId, block.timestamp);
    }

    /// @notice Add suggestion to existing policy draft
    function addSuggestion(
        uint256 draftId,
        euint32 encryptedSuggestionData
    ) public {
        require(draftId <= draftCount, "Invalid draft ID");
        
        suggestionCount += 1;
        uint256 newSuggestionId = suggestionCount;
        
        encryptedSuggestions[newSuggestionId] = EncryptedSuggestion({
            draftId: draftId,
            encryptedSuggestion: encryptedSuggestionData,
            timestamp: block.timestamp
        });
        
        emit SuggestionAdded(draftId, newSuggestionId);
    }

    /// @notice Aggregate suggestions for a policy draft
    function aggregateSuggestions(uint256 draftId) public {
        require(draftId <= draftCount, "Invalid draft ID");
        
        euint32 aggregated = FHE.asEuint32(0);
        uint256 count = 0;
        
        for (uint256 i = 1; i <= suggestionCount; i++) {
            if (encryptedSuggestions[i].draftId == draftId) {
                aggregated = FHE.add(aggregated, encryptedSuggestions[i].encryptedSuggestion);
                count++;
            }
        }
        
        if (count > 0) {
            aggregatedSuggestions[draftId] = aggregated;
            emit AggregationCompleted(draftId);
        }
    }

    /// @notice Request decryption of a policy draft
    function requestDraftDecryption(uint256 draftId) public {
        EncryptedDraft storage draft = encryptedDrafts[draftId];
        require(!decryptedDrafts[draftId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(draft.encryptedTitle);
        ciphertexts[1] = FHE.toBytes32(draft.encryptedContent);
        ciphertexts[2] = FHE.toBytes32(draft.encryptedCategory);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDraft.selector);
        requestToDraftId[reqId] = draftId;
    }

    /// @notice Callback for decrypted draft data
    function decryptDraft(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 draftId = requestToDraftId[requestId];
        require(draftId != 0, "Invalid request");
        
        EncryptedDraft storage eDraft = encryptedDrafts[draftId];
        DecryptedDraft storage dDraft = decryptedDrafts[draftId];
        require(!dDraft.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dDraft.title = results[0];
        dDraft.content = results[1];
        dDraft.category = results[2];
        dDraft.isRevealed = true;
        
        emit DraftDecrypted(draftId);
    }

    /// @notice Request decryption of aggregated suggestions
    function requestAggregationDecryption(uint256 draftId) public {
        euint32 agg = aggregatedSuggestions[draftId];
        require(FHE.isInitialized(agg), "No aggregation available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(agg);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAggregation.selector);
        requestToDraftId[reqId] = draftId;
    }

    /// @notice Callback for decrypted aggregation data
    function decryptAggregation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 draftId = requestToDraftId[requestId];
        require(draftId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 result = abi.decode(cleartexts, (uint32));
        // Handle decrypted aggregation result as needed
    }

    /// @notice Get decrypted draft details
    function getDecryptedDraft(uint256 draftId) public view returns (
        string memory title,
        string memory content,
        string memory category,
        bool isRevealed
    ) {
        DecryptedDraft storage d = decryptedDrafts[draftId];
        return (d.title, d.content, d.category, d.isRevealed);
    }

    /// @notice Get aggregated suggestions for a draft
    function getAggregatedSuggestions(uint256 draftId) public view returns (euint32) {
        return aggregatedSuggestions[draftId];
    }
}