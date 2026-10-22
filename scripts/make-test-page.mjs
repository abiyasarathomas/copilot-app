// Turns the test build (dist-test/) into one self-contained page that can be
// published as a Claude artifact: the app's CSS and JS are inlined.
import fs from "node:fs";
const dir = "dist-test/assets";
const files = fs.readdirSync(dir);
const css = files.filter(f => f.endsWith(".css")).map(f => fs.readFileSync(`${dir}/${f}`, "utf8")).join("\n");
const js = files.filter(f => f.endsWith(".js")).map(f => fs.readFileSync(`${dir}/${f}`, "utf8")).join("\n");
const page = `<meta charset="utf-8">
<title>Co-Pilot</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..800&family=Geist+Mono:wght@400;500;600&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>
`;
fs.writeFileSync("dist-test/copilot-test.html", page);
console.log("wrote dist-test/copilot-test.html", (page.length / 1024).toFixed(0) + " KB");
