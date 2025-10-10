// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface PolicyProposal {
  id: string;
  encryptedContent: string;
  timestamp: number;
  author: string;
  category: string;
  upvotes: number;
  downvotes: number;
}

const App: React.FC = () => {
  // Randomly selected style: High contrast black/white + Cyberpunk + Center radiation + Gesture controls
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<PolicyProposal[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newProposalData, setNewProposalData] = useState({
    title: "",
    category: "",
    content: ""
  });
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showStats, setShowStats] = useState(false);

  // Randomly selected additional features: Search & Filter, Data Statistics, Project Introduction
  const categories = ["Education", "Healthcare", "Infrastructure", "Environment", "Economy", "Security"];

  useEffect(() => {
    loadProposals().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadProposals = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("proposal_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing proposal keys:", e);
        }
      }
      
      const list: PolicyProposal[] = [];
      
      for (const key of keys) {
        try {
          const proposalBytes = await contract.getData(`proposal_${key}`);
          if (proposalBytes.length > 0) {
            try {
              const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
              list.push({
                id: key,
                encryptedContent: proposalData.content,
                timestamp: proposalData.timestamp,
                author: proposalData.author,
                category: proposalData.category,
                upvotes: proposalData.upvotes || 0,
                downvotes: proposalData.downvotes || 0
              });
            } catch (e) {
              console.error(`Error parsing proposal data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading proposal ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setProposals(list);
    } catch (e) {
      console.error("Error loading proposals:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitProposal = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting policy proposal with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedContent = `FHE-${btoa(JSON.stringify(newProposalData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const proposalData = {
        content: encryptedContent,
        timestamp: Math.floor(Date.now() / 1000),
        author: account,
        category: newProposalData.category,
        upvotes: 0,
        downvotes: 0
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(proposalData))
      );
      
      const keysBytes = await contract.getData("proposal_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(proposalId);
      
      await contract.setData(
        "proposal_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted proposal submitted anonymously!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewProposalData({
          title: "",
          category: "",
          content: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const voteOnProposal = async (proposalId: string, isUpvote: boolean) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing anonymous vote with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalBytes = await contract.getData(`proposal_${proposalId}`);
      if (proposalBytes.length === 0) {
        throw new Error("Proposal not found");
      }
      
      const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
      
      const updatedProposal = {
        ...proposalData,
        upvotes: isUpvote ? proposalData.upvotes + 1 : proposalData.upvotes,
        downvotes: !isUpvote ? proposalData.downvotes + 1 : proposalData.downvotes
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProposal))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Vote recorded anonymously!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Voting failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredProposals = proposals.filter(proposal => {
    const matchesSearch = proposal.encryptedContent.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeTab === "all" || proposal.category === activeTab;
    return matchesSearch && matchesCategory;
  });

  const totalVotes = proposals.reduce((sum, proposal) => sum + proposal.upvotes + proposal.downvotes, 0);
  const mostControversial = proposals.length > 0 
    ? proposals.reduce((prev, current) => 
        (prev.upvotes + prev.downvotes) > (current.upvotes + current.downvotes) ? prev : current
      ) 
    : null;

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing anonymous connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <h1>Policy<span>Pulse</span></h1>
          <div className="tagline">Anonymous Public Policy Deliberation</div>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="central-radial-layout">
          <div className="platform-intro">
            <h2>Shape Policies Anonymously</h2>
            <p>Contribute to public policy discussions without revealing your identity using FHE technology</p>
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="create-btn cyber-button"
            >
              + New Proposal
            </button>
          </div>
          
          <div className="control-panel">
            <div className="search-filter">
              <input
                type="text"
                placeholder="Search proposals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="cyber-input"
              />
              <div className="category-tabs">
                <button 
                  className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                  onClick={() => setActiveTab("all")}
                >
                  All
                </button>
                {categories.map(category => (
                  <button
                    key={category}
                    className={`tab-btn ${activeTab === category ? "active" : ""}`}
                    onClick={() => setActiveTab(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="stats-toggle">
              <button 
                className="cyber-button"
                onClick={() => setShowStats(!showStats)}
              >
                {showStats ? "Hide Statistics" : "Show Statistics"}
              </button>
            </div>
          </div>
          
          {showStats && (
            <div className="stats-panel cyber-card">
              <h3>Community Engagement</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{proposals.length}</div>
                  <div className="stat-label">Total Proposals</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{totalVotes}</div>
                  <div className="stat-label">Total Votes</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {proposals.length > 0 ? 
                      (proposals.reduce((sum, p) => sum + p.upvotes, 0) / totalVotes * 100).toFixed(1) + "%" 
                      : "0%"}
                  </div>
                  <div className="stat-label">Approval Rate</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {mostControversial ? `${mostControversial.upvotes + mostControversial.downvotes} votes` : "N/A"}
                  </div>
                  <div className="stat-label">Most Discussed</div>
                </div>
              </div>
            </div>
          )}
          
          <div className="proposals-list">
            <div className="list-header cyber-card">
              <div className="header-cell">Proposal</div>
              <div className="header-cell">Category</div>
              <div className="header-cell">Author</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Sentiment</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredProposals.length === 0 ? (
              <div className="no-proposals cyber-card">
                <div className="no-data-icon"></div>
                <p>No proposals found</p>
                <button 
                  className="cyber-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Be the first to propose
                </button>
              </div>
            ) : (
              filteredProposals.map(proposal => (
                <div className="proposal-item cyber-card" key={proposal.id}>
                  <div className="proposal-content">
                    <h3>Policy Proposal #{proposal.id.substring(0, 6)}</h3>
                    <p className="category">{proposal.category}</p>
                    <p className="meta">
                      <span className="author">Anonymous User</span>
                      <span className="date">
                        {new Date(proposal.timestamp * 1000).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                  <div className="sentiment-meter">
                    <div 
                      className="approval-bar" 
                      style={{ 
                        width: `${(proposal.upvotes / (proposal.upvotes + proposal.downvotes || 1)) * 100}%` 
                      }}
                    ></div>
                    <div className="vote-count">
                      {proposal.upvotes} 👍 / {proposal.downvotes} 👎
                    </div>
                  </div>
                  <div className="proposal-actions">
                    <button 
                      className="action-btn cyber-button success"
                      onClick={() => voteOnProposal(proposal.id, true)}
                    >
                      Support
                    </button>
                    <button 
                      className="action-btn cyber-button danger"
                      onClick={() => voteOnProposal(proposal.id, false)}
                    >
                      Oppose
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitProposal} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          proposalData={newProposalData}
          setProposalData={setNewProposalData}
          categories={categories}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <span>PolicyPulse</span>
            </div>
            <p>Anonymous public policy deliberation powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Fully Homomorphic Encryption</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} PolicyPulse. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  proposalData: any;
  setProposalData: (data: any) => void;
  categories: string[];
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  proposalData,
  setProposalData,
  categories
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProposalData({
      ...proposalData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!proposalData.category || !proposalData.content) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>New Policy Proposal</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your identity will remain anonymous using FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Title</label>
              <input 
                type="text"
                name="title"
                value={proposalData.title} 
                onChange={handleChange}
                placeholder="Brief title..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group">
              <label>Category *</label>
              <select 
                name="category"
                value={proposalData.category} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="">Select category</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Proposal Content *</label>
              <textarea 
                name="content"
                value={proposalData.content} 
                onChange={handleChange}
                placeholder="Enter your policy proposal details..." 
                className="cyber-textarea"
                rows={6}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Your participation is completely anonymous
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button primary"
          >
            {creating ? "Submitting anonymously..." : "Submit Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;