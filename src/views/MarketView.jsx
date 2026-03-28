import MarketHero from "./market/MarketHero";
import MarketCharts from "./market/MarketCharts";
import MarketNews from "./market/MarketNews";
import MarketActivity from "./market/MarketActivity";
import MarketTrading from "./market/MarketTrading";
import MarketAdmin, { MarketAdminSidebar } from "./market/MarketAdmin";

export default function MarketView({
  // Market data
  selectedMarket,
  selectedStatus,
  selectedSignal,
  selectedHistory,
  heroSignalFacts,
  quickFacts,
  hitProbability,
  missProbability,
  hitPreview,
  missPreview,
  selectedPositionLabel,
  selectedOutcomeLabel,
  selectedCompanyProfile,
  selectedMajorHolders,
  activityFeed,
  companyNews,
  // Surface routing
  marketSurface,
  activeMarketSection,
  openMarketSurface,
  clearSelectedMarket,
  // Access
  canAccessAdmin,
  // Trade actions
  stakeAmount,
  setStakeAmount,
  busyAction,
  takePosition,
  settleMarket,
  claimPayout,
  refreshNow,
  copySelectedMarketLink,
  // Attestation
  attestationForm,
  updateAttestation,
  signAttestation,
  relayAttestation,
  publishDirectResolution,
  signature,
  digest,
  // Operator forms
  operatorForm,
  updateOperatorForm,
  setEligibility,
  grantCredits,
  setReporter,
  setSigner,
  createMarketForm,
  updateCreateMarketForm,
  createMarket,
  cancelSelectedMarket,
  prefillCreateMarketForm,
  applyDemoPreset,
  copyRuntimeSummary,
  // Admin blacklist
  blacklist,
  blacklistDraft,
  updateBlacklistDraft,
  addBlacklistedAddress,
  removeBlacklistedAddress,
}) {
  return (
    <main
      id="main-content"
      className={marketSurface === "overview" ? "market-layout" : "market-admin-layout"}
    >
      <section className="market-main">
        <MarketHero
          selectedMarket={selectedMarket}
          selectedStatus={selectedStatus}
          heroSignalFacts={heroSignalFacts}
          selectedCompanyProfile={selectedCompanyProfile}
          selectedMajorHolders={selectedMajorHolders}
          quickFacts={quickFacts}
          marketSurface={marketSurface}
          activeMarketSection={activeMarketSection}
          openMarketSurface={openMarketSurface}
          clearSelectedMarket={clearSelectedMarket}
          canAccessAdmin={canAccessAdmin}
          busyAction={busyAction}
          refreshNow={refreshNow}
          copySelectedMarketLink={copySelectedMarketLink}
        />

        {marketSurface === "overview" ? (
          <>
            <MarketCharts
              selectedMarket={selectedMarket}
              selectedCompanyProfile={selectedCompanyProfile}
              selectedMajorHolders={selectedMajorHolders}
              quickFacts={quickFacts}
              selectedHistory={selectedHistory}
            />
            <MarketNews
              selectedMarket={selectedMarket}
              companyNews={companyNews}
            />
            <MarketActivity activityFeed={activityFeed} />
          </>
        ) : (
          <MarketAdmin
            selectedMarket={selectedMarket}
            busyAction={busyAction}
            attestationForm={attestationForm}
            updateAttestation={updateAttestation}
            signAttestation={signAttestation}
            relayAttestation={relayAttestation}
            publishDirectResolution={publishDirectResolution}
            signature={signature}
            digest={digest}
            operatorForm={operatorForm}
            updateOperatorForm={updateOperatorForm}
            setEligibility={setEligibility}
            grantCredits={grantCredits}
            setReporter={setReporter}
            setSigner={setSigner}
            createMarketForm={createMarketForm}
            updateCreateMarketForm={updateCreateMarketForm}
            createMarket={createMarket}
            cancelSelectedMarket={cancelSelectedMarket}
            prefillCreateMarketForm={prefillCreateMarketForm}
            applyDemoPreset={applyDemoPreset}
            copyRuntimeSummary={copyRuntimeSummary}
          />
        )}
      </section>

      {marketSurface === "overview" ? (
        <MarketTrading
          selectedMarket={selectedMarket}
          hitProbability={hitProbability}
          missProbability={missProbability}
          hitPreview={hitPreview}
          missPreview={missPreview}
          selectedPositionLabel={selectedPositionLabel}
          selectedOutcomeLabel={selectedOutcomeLabel}
          stakeAmount={stakeAmount}
          setStakeAmount={setStakeAmount}
          busyAction={busyAction}
          takePosition={takePosition}
          settleMarket={settleMarket}
          claimPayout={claimPayout}
        />
      ) : (
        <MarketAdminSidebar />
      )}
    </main>
  );
}
