function errorResponse(input, error, rationale, extra = {}) {
  return {
    input,
    error,
    outcome: "refuse",
    rationale,
    classification: null,
    extraction: null,
    signals: null,
    ...extra,
  };
}

module.exports = { errorResponse };
