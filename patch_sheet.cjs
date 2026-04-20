const fs = require("fs");
const f = "src/web/sheetBaoGia.html";
let c = fs.readFileSync(f, "utf8");

// 1. Remove inline <style>...</style>
c = c.replace(/<style>[\s\S]*?<\/style>/g, "");

// 2. Add CSS <link> right after the opening <head> tag
c = c.replace(
  "<head>",
  '<head>\n  <link rel="stylesheet" href="css/sheetBaoGia.css"/>'
);

// 3. Replace inline <script>...</script> before </body> with external script
const scriptPattern = /<script>\s*[\s\S]*?<\/script>\s*<\/body>/;
c = c.replace(
  scriptPattern,
  '<script src="js/sheetBaoGia.js"></script>\n</body>'
);

fs.writeFileSync(f, c, "utf8");
