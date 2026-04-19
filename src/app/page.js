"use client";

import Script from "next/script";

export default function Home() {
  return (
    <>
      <div className="main-layout">
        <div className="sidebar">
          <div className="logo">
            <div className="logo-dot">S</div>
            <div className="logo-text">
              <div className="main">Sparmanik Farm</div>
              <div className="sub">Cultivation OS</div>
            </div>
          </div>
          <div className="nav" id="nav-menu" />
        </div>
        <div className="content-area">
          <div className="topbar">
            <div className="topbar-left">
              <div className="topbar-label" id="topbar-label">
                Welcome Back
              </div>
              <div className="topbar-name">Boyd</div>
            </div>
            <div className="topbar-right">
              <div className="exchange-rate">
                Rate: <span id="exchange-rate-display">10,200</span> IDR/AUD
              </div>
              <div className="lang-toggle">
                <button
                  type="button"
                  className="lang-btn active"
                  data-lang="en"
                  id="lang-en"
                >
                  EN
                </button>
                <button type="button" className="lang-btn" data-lang="id" id="lang-id">
                  ID
                </button>
              </div>
              <div className="alert-bell" id="alert-bell-icon">
                🔔
                <div className="alert-badge hidden" id="alert-badge">
                  0
                </div>
              </div>
              <div className="alert-dropdown hidden" id="alert-dropdown" />
            </div>
          </div>
          <div className="page-container" id="page-container" />
        </div>
      </div>
      <div id="modal-overlay" className="modal-overlay">
        <div id="modal-content" />
      </div>
      <div id="flash-msg" className="flash" />
      <button
        type="button"
        className="history-fab"
        onClick={() => {
          if (typeof window !== "undefined" && window.openHistoryModal) {
            window.openHistoryModal();
          }
        }}
        title="Action History"
      >
        ↩
      </button>
      <Script src="/farm-legacy.js" strategy="afterInteractive" />
    </>
  );
}
