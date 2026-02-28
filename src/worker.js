import JSZip from "jszip"

/* =============================
   AI 排版判定
============================= */

function extractText(html){
  return html.replace(/<[^>]+>/g,"")
}

function classicalRatio(text){
  const classicalWords="之乎者也焉其若乃则兮矣耳"
  let count=0
  for(const c of text){
    if(classicalWords.includes(c)) count++
  }
  return count / Math.max(text.length,1)
}

function decideLayout(text){
  if(classicalRatio(text)>0.03) return "vertical"
  if(/[ぁ-んァ-ン]/.test(text)) return "vertical"
  if(text.length>50000) return "compact"
  return "novel"
}

/* =============================
   出版级 CSS
============================= */

function generateCSS(strategy){

// ===== 竖排（Kindle兼容）=====
if(strategy==="vertical"){
return `
html, body{
writing-mode: vertical-rl;
-webkit-writing-mode: vertical-rl;
line-height:1.9;
letter-spacing:0.06em;
margin:8% 6%;
text-align:justify;
}

p{
text-indent:2em;
margin-left:1.2em;
}

h1,h2,h3{
text-align:center;
}
`
}

// ===== 紧凑 =====
if(strategy==="compact"){
return `
body{
line-height:1.6;
margin:5% 6%;
text-align:justify;
}
p{text-indent:2em}
`
}

// ===== 默认阅读 =====
return `
body{
line-height:1.85;
letter-spacing:0.01em;
margin:6% 8%;
text-align:justify;
}
p{text-indent:2em;margin-bottom:0.9em}
h1,h2,h3{text-align:center}
`
}

/* =============================
   Worker 主逻辑
============================= */

export default {
async fetch(request){

/* ---------- UI 页面 ---------- */

if (request.method === "GET") {
return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>云书排 · EPUB AI排版</title>

<style>
body{
margin:0;
font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto;
background:linear-gradient(135deg,#667eea,#764ba2);
height:100vh;
display:flex;
align-items:center;
justify-content:center;
}

.card{
background:white;
padding:40px;
border-radius:16px;
width:420px;
box-shadow:0 20px 60px rgba(0,0,0,0.2);
text-align:center;
}

input,select{
width:100%;
padding:12px;
margin-top:10px;
border-radius:8px;
border:1px solid #ddd;
}

button{
margin-top:20px;
width:100%;
padding:14px;
border:none;
border-radius:8px;
background:#667eea;
color:white;
font-size:16px;
cursor:pointer;
}

#loading{display:none;margin-top:20px;}
</style>
</head>

<body>
<div class="card">
<h1>📘 云书排</h1>
<p>EPUB AI自动排版 · Kindle优化</p>

<form id="form">
<input type="file" name="file" accept=".epub" required>

<select name="mode">
<option value="auto">AI自动（推荐）</option>
<option value="horizontal">横排出版物</option>
<option value="vertical">竖排阅读</option>
<option value="novel">小说阅读</option>
<option value="compact">紧凑排版</option>
</select>

<button type="submit">开始转换</button>
</form>

<div id="loading">处理中，请稍候...</div>
</div>

<script>
const form=document.getElementById("form")
const loading=document.getElementById("loading")

form.onsubmit=async e=>{
e.preventDefault()
loading.style.display="block"

const fd=new FormData(form)
const res=await fetch("/",{method:"POST",body:fd})
const blob=await res.blob()

loading.style.display="none"

const a=document.createElement("a")
a.href=URL.createObjectURL(blob)
a.download="converted.epub"
a.click()
}
</script>

</body>
</html>
`,{headers:{"Content-Type":"text/html"}})
}

/* ---------- 处理 EPUB ---------- */

try{

const form=await request.formData()
const file=form.get("file")
const mode=form.get("mode")||"auto"

if(!file||!file.name.endsWith(".epub")){
return new Response("仅支持EPUB",{status:400})
}

// 读取 EPUB
const zip=await JSZip.loadAsync(await file.arrayBuffer())

/* ---------- 提取文本样本 ---------- */

let textSample=""

for(const name of Object.keys(zip.files)){
if(name.endsWith(".xhtml")||name.endsWith(".html")){
const html=await zip.file(name).async("string")
textSample+=extractText(html).slice(0,2000)
break
}
}

/* ---------- AI判定排版 ---------- */

const strategy=mode==="auto"?decideLayout(textSample):mode
const css=generateCSS(strategy)

// 写入统一CSS
zip.file("publication.css",css)

/* ---------- 修改HTML（安全注入CSS） ---------- */

for(const name of Object.keys(zip.files)){

if(name.endsWith(".xhtml")||name.endsWith(".html")){

let html=await zip.file(name).async("string")

// 删除旧CSS引用
html=html.replace(/<link[^>]*stylesheet[^>]*>/gi,"")

// 注入出版CSS
if(!html.includes("publication.css")){
html=html.replace(
/<head[^>]*>/i,
match=>match+'\\n<link rel="stylesheet" href="publication.css"/>'
)
}

zip.file(name,html)
}
}

/* ---------- 删除旧CSS文件 ---------- */

for(const name of Object.keys(zip.files)){
if(name.endsWith(".css")&&name!=="publication.css"){
delete zip.files[name]
}
}

/* ---------- 输出 EPUB ---------- */

const output=await zip.generateAsync({
type:"arraybuffer",
mimeType:"application/epub+zip"
})

return new Response(output,{
headers:{
"Content-Type":"application/epub+zip",
"Content-Disposition":"attachment; filename=converted.epub"
}
})

}catch(e){
return new Response("EPUB处理失败："+e.message,{status:500})
}

}
}
