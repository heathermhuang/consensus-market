import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { shortAddress } from "./contracts";

const walletChoices = [
  {
    id: "metamask",
    title: "MetaMask",
    description: "Browser extension",
    mode: "injected",
  },
  {
    id: "rabby",
    title: "Rabby",
    description: "Browser extension",
    mode: "injected",
  },
  {
    id: "coinbase",
    title: "Coinbase Wallet",
    description: "Browser extension",
    mode: "injected",
  },
  {
    id: "mobile",
    title: "Mobile Wallet / QR",
    description: "WalletConnect",
    mode: "walletconnect",
  },
];

function isProbablyMobile() {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
}

export default function ConnectModal({
  open,
  wallet,
  walletOnExpectedChain,
  isBlacklisted,
  onClose,
  onConnectWalletConnect,
  onConnectInjected,
  onSwitchNetwork,
  onDisconnect,
  onOpenAccount,
}) {
  const [selectedChoice, setSelectedChoice] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busyChoice, setBusyChoice] = useState("");
  const [walletUri, setWalletUri] = useState("");
  const [walletQr, setWalletQr] = useState("");

  const mobileDevice = isProbablyMobile();
  const hasInjectedWallet = typeof window !== "undefined" && Boolean(window.ethereum);

  useEffect(() => {
    if (!open) return;
    setSelectedPath("");
    setSelectedChoice("");
    setFeedback("");
    setBusyChoice("");
    setWalletUri("");
    setWalletQr("");
  }, [open, wallet.account]);

  useEffect(() => {
    let cancelled = false;

    async function renderQr() {
      if (!walletUri) {
        setWalletQr("");
        return;
      }

      try {
        const nextQr = await QRCode.toDataURL(walletUri, {
          width: 220,
          margin: 1,
          color: {
            dark: "#17324c",
            light: "#fffdfa",
          },
        });
        if (!cancelled) {
          setWalletQr(nextQr);
        }
      } catch {
        if (!cancelled) {
          setWalletQr("");
        }
      }
    }

    void renderQr();

    return () => {
      cancelled = true;
    };
  }, [walletUri]);

  if (!open) return null;

  async function handleConnect(choice) {
    if (busyChoice) return;

    setBusyChoice(choice.id);
    setSelectedChoice(choice.id);
    setFeedback("");
    setWalletUri("");

    try {
      if (choice.mode === "injected") {
        setFeedback(`Opening ${choice.title}...`);
        await onConnectInjected(choice.id);
        return;
      }

      setFeedback("Opening WalletConnect...");
      await onConnectWalletConnect({
        selectedWallet: choice.id,
        onDisplayUri: (uri) => {
          setWalletUri(uri || "");
          if (uri) {
            setFeedback(
              mobileDevice
                ? "Open this link in your wallet app or scan the QR code below."
                : "Scan this QR code in your wallet app, or copy the WalletConnect link."
            );
          }
        },
      });
    } catch (error) {
      setFeedback(error?.message || "Wallet connection failed.");
    } finally {
      setBusyChoice("");
    }
  }

  async function copyWalletUri() {
    if (!walletUri) return;
    try {
      await navigator.clipboard.writeText(walletUri);
      setFeedback("WalletConnect link copied.");
    } catch {
      setFeedback("Failed to copy the WalletConnect link.");
    }
  }

  const browserChoices = walletChoices.filter((choice) => choice.mode === "injected");
  const mobileChoice = walletChoices.find((choice) => choice.id === "mobile");
  const browserChoiceTitle =
    selectedChoice && browserChoices.some((choice) => choice.id === selectedChoice)
      ? walletChoices.find((choice) => choice.id === selectedChoice)?.title
      : "Browser wallet";

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="connect-modal surface-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-wallet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="section-label">Wallet access</p>
            <h2 id="connect-wallet-title">{wallet.account ? "Wallet connected" : "Connect wallet"}</h2>
          </div>
          <button type="button" className="ghost modal-close" onClick={onClose}>
            Close
          </button>
        </div>

        {!wallet.account ? (
          <>
            {!selectedPath ? (
              <>
                <p className="panel-copy">
                  Start by choosing where your wallet lives. The next step only shows the actions for that path.
                </p>

                <div className="wallet-path-grid">
                  <button
                    type="button"
                    className="wallet-path-card wallet-path-card-primary"
                    onClick={() => {
                      setSelectedPath("browser");
                      setFeedback("");
                      setSelectedChoice("");
                    }}
                  >
                    <span className="wallet-choice-copy">
                      <strong>This browser</strong>
                      <span>Use MetaMask, Rabby, or Coinbase Wallet if the extension is installed here.</span>
                    </span>
                    <span className="wallet-choice-tag">Step 1</span>
                  </button>

                  <button
                    type="button"
                    className="wallet-path-card wallet-path-card-secondary"
                    onClick={() => {
                      setSelectedPath("mobile");
                      setFeedback("");
                      setSelectedChoice("");
                      setWalletUri("");
                    }}
                  >
                    <span className="wallet-choice-copy">
                      <strong>Phone wallet</strong>
                      <span>Use WalletConnect when the wallet app is on your phone or another device.</span>
                    </span>
                    <span className="wallet-choice-tag">Step 1</span>
                  </button>
                </div>
              </>
            ) : selectedPath === "browser" ? (
              <>
                <div className="wallet-step-header">
                  <button
                    type="button"
                    className="ghost wallet-step-back"
                    onClick={() => {
                      setSelectedPath("");
                      setSelectedChoice("");
                      setFeedback("");
                    }}
                  >
                    Back
                  </button>
                  <div>
                    <p className="section-label">Step 2</p>
                    <h3>Choose a browser wallet</h3>
                  </div>
                </div>

                <p className="panel-copy">
                  {hasInjectedWallet
                    ? "Pick the wallet you want to open in this browser."
                    : "No browser wallet was detected here. Use your phone wallet instead, or install an extension first."}
                </p>

                {hasInjectedWallet ? (
                  <div className="wallet-choice-grid wallet-choice-grid-single">
                    {browserChoices.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        className="wallet-choice wallet-choice-primary"
                        onClick={() => handleConnect(choice)}
                        disabled={Boolean(busyChoice)}
                      >
                        <span className="wallet-choice-copy">
                          <strong>{choice.title}</strong>
                          <span>{selectedChoice === choice.id ? "Selected browser wallet." : choice.description}</span>
                        </span>
                        <span className="wallet-choice-tag">{busyChoice === choice.id ? "Opening..." : "Connect"}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>No browser wallet was detected.</strong>
                    <p>Switch to the phone wallet path to connect with WalletConnect, or install a supported extension.</p>
                    <div className="hero-actions">
                      <button type="button" className="primary" onClick={() => setSelectedPath("mobile")}>
                        Use phone wallet
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="wallet-step-header">
                  <button
                    type="button"
                    className="ghost wallet-step-back"
                    onClick={() => {
                      setSelectedPath("");
                      setSelectedChoice("");
                      setFeedback("");
                      setWalletUri("");
                      setWalletQr("");
                    }}
                  >
                    Back
                  </button>
                  <div>
                    <p className="section-label">Step 2</p>
                    <h3>Connect your phone wallet</h3>
                  </div>
                </div>

                <p className="panel-copy">
                  Start the handoff when you are ready. We only show the WalletConnect QR and link after you choose this path.
                </p>

                {!walletUri && (
                  <div className="wallet-mobile-start">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => mobileChoice && handleConnect(mobileChoice)}
                      disabled={Boolean(busyChoice) || !mobileChoice}
                    >
                      {busyChoice === "mobile" ? "Starting handoff..." : "Start mobile handoff"}
                    </button>
                    <p className="instruction-note">
                      {mobileDevice
                        ? "This opens a WalletConnect session you can continue in your phone wallet."
                        : "This generates a QR code and WalletConnect link for your phone wallet."}
                    </p>
                  </div>
                )}

                {(walletUri || busyChoice === "mobile") && (
                  <div className="wallet-assist-grid wallet-assist-grid-single">
                    <div className="wallet-qr-shell">
                      <div className="wallet-qr-canvas">
                        {walletQr ? (
                          <img src={walletQr} alt="WalletConnect QR code" />
                        ) : (
                          <span className="instruction-note">Preparing the WalletConnect handoff.</span>
                        )}
                      </div>
                      <div className="wallet-handoff-copy">
                        <strong>{selectedChoice === "mobile" ? "WalletConnect session ready" : "Use your mobile wallet"}</strong>
                        <p className="instruction-note">
                          {mobileDevice
                            ? "Open the handoff link in your wallet app, or scan the QR code if you prefer."
                            : "Scan the QR code with your wallet app, or copy the WalletConnect link."}
                        </p>
                      </div>
                      <div className="hero-actions">
                        <button type="button" className="ghost" onClick={copyWalletUri} disabled={!walletUri}>
                          Copy WalletConnect link
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <p className="wallet-feedback" role="status">{feedback}</p>
          </>
        ) : (
          <>
            <div className="account-summary-grid">
              <article className="snapshot-card">
                <span className="field-label">Address</span>
                <strong>{shortAddress(wallet.account)}</strong>
                <p>{wallet.connector === "walletconnect" ? "Connected through your phone wallet." : `Connected through ${browserChoiceTitle}.`}</p>
              </article>
              <article className="snapshot-card">
                <span className="field-label">Network</span>
                <strong>{walletOnExpectedChain ? "Ethereum ready" : "Wrong network"}</strong>
                <p>{wallet.chainId ? `Chain ${wallet.chainId}` : "Waiting for network details."}</p>
              </article>
            </div>

            {isBlacklisted && (
              <div className="account-alert account-alert-danger" role="status">
                This wallet is currently blocked by the local operator blacklist.
              </div>
            )}

            <div className="hero-actions">
              {!walletOnExpectedChain && (
                <button type="button" className="primary" onClick={onSwitchNetwork}>
                  Switch to Ethereum
                </button>
              )}
              <button type="button" className="ghost" onClick={onOpenAccount}>
                Open account page
              </button>
              <button type="button" className="ghost" onClick={onDisconnect}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
