if (window.location.hostname === "capital.markets") {
  window.location.replace(
    `https://consensusmarket.com${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}
