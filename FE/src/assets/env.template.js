(function (window) {
  window.env = window.env || {};
  window["env"]["API_URL"] = "${API_URL}";
  window["env"]["api_end_point"] = "${api_end_point}";
  window["env"]["auth_api"] = "${auth_api}";
  window["env"]["issuer"] = "${issuer}";
  window["env"]["realm"] = "${realm}";
  window["env"]["clientId"] = "${clientId}";
})(this);