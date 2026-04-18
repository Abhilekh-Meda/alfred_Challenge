const { claritySignals } = require("./clarity");
const { riskSignals } = require("./risk");
const { policySignals } = require("./policy");

function computeSignals(action) {
  return {
    clarity: claritySignals(action),
    risk: riskSignals(action),
    policy: policySignals(action),
  };
}

module.exports = { computeSignals };
