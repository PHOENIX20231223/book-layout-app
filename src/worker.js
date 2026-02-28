import JSZip from "jszip"

/* =============================
   思源宋体（演示版）
   如需完整字体建议使用 R2
============================= */

const FONT_BASE64 =
"AAEAAAALAIAAAwAwT1MvMg8SBJcAAAC8AAAAYGNtYXABdXUAAAF8AAABPGdhc3AAAAAQAAADHAAAAAhnbHlmAAAAAAADHAAAACBoZWFkAAABJAAAADZoaGVhAAABWAAAACRobXR4AAABeAAAABRsb2NhAAABkAAAABRtYXhwAAABsAAAACBuYW1lAAABzAAAADZwb3N0AAAB/AAAACBwcmVwAAACGAAAADYAAQAAAADMPaLPAAAAAMw9os8AAQAAAAA="

function base64ToArrayBuffer(base64){
const binary=atob(base64)
const len=binary.length
const bytes=new Uint8Array(len)
for(let i=0;i<len;i++) bytes[i]=binary.charCodeAt(i)
return bytes
}

/* =============================
   AI 排版逻辑
============================= */

function extractText(html){
return html.replace(/<[^>]+>/g,"")
}

function classicalRatio(text){
const classicalWords="之乎者也焉其若乃则兮矣耳"
let count=0
for(const c of text) if(classicalWords.includes(c)) count++
return count/Math.max(text.length,1)
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

const fontFace=`
@font-face{
font-family:"BookFont";
src:url("font.otf");
}
`

if(strategy==="vertical"){
return fontFace+`
html,body{
writing-mode:vertical-rl;
-webkit-writing-mode:vertical-rl;
font-family:"BookFont";
line-height:1.9;
letter-spacing:0.06em;
margin:8% 6%;
}
p{text-indent:2em;margin-left:1.2em}
`
}

if(strategy==="compact"){
return fontFace+`
body{
font-family:"BookFont";
line-height:1.6;
margin:5% 6%;
}
p{text-indent:2em}
`
}

return fontFace+`
body{
font-family:"BookFont";
line-height:1.85;
letter-spacing:0.01em;
margin:6% 8%;
}
p{text-indent:2em;margin-bottom:0.9em}
`
}

/* =============================
   TXT 自动分章
============================= */

function splitChapters(text){

const lines=text.split(/\r?\n/)
let chapters=[]
let current={title:"正文",content:[]}

const chapterRegex=/^(第[0-9一二三四五六七八九十百千]+章|Chapter\s+\d+|\d+\.)/i

for(const line of lines){

if(chapterRegex.test(line.trim())){
if(current.content.length) chapters.push(current)
current={title:line.trim(),content:[]}
}else{
current.content.push(line)
}
}

chapters.push(current)
return chapters
}

/* =============================
   TXT → EPUB
============================= */

async function createEPUBFromTXT(text,css){

const zip=new JSZip()

zip.file("mimetype","application/epub+zip",{compression:"STORE"})

zip.file("META-INF/container.xml",`
<?xml version="1.0"?>
<container version="1.0"
xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf"
media-type="application/oebps-package+xml"/>
</rootfiles>
</container>`)

const chapters=splitChapters(text)

let manifest=""
let spine=""
let nav=""

chapters.forEach((ch,i)=>{

const id="ch"+i
const paragraphs=ch.content.map(p=>`<p>${p}</p>`).join("")

zip.file(`OEBPS/${id}.xhtml`,`
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>${ch.title}</title>
<link rel="stylesheet" href="publication.css"/>
</head>
<body><h2>${ch.title}</h2>${paragraphs}</body>
</html>`)

manifest+=`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`
spine+=`<itemref idref="${id}"/>`
nav+=`<li><a href="${id}.xhtml">${ch.title}</a></li>`
})

zip.file("OEBPS/nav.xhtml",`
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
<nav epub:type="toc"><ol>${nav}</ol></nav>
</body></html>`)

zip.file("OEBPS/publication.css",css)
zip.file("OEBPS/font.otf",base64ToArrayBuffer(FONT_BASE64))

zip.file("OEBPS/content.opf",`
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="publication.css" media-type="text/css"/>
<item id="font" href="font.otf" media-type="font/otf"/>
${manifest}
</manifest>
<spine>${spine}</spine>
</package>`)

return zip
}

/* =============================
   Worker 主逻辑
============================= */

export default {
async fetch(request){

/* ===== UI 页面 ===== */

if(request.method==="GET"){
return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>CloudBook</title>

<style>

/* ===== Reset ===== */

*{box-sizing:border-box}
body{
margin:0;
font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica;
background:#f6f7f9;
color:#111;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}

/* ===== App ===== */

.app{
width:640px;
background:white;
border-radius:18px;
box-shadow:0 30px 80px rgba(0,0,0,.08);
padding:48px;
}

/* ===== Header ===== */

.header{
display:flex;
justify-content:space-between;
align-items:center;
margin-bottom:32px;
}

.logo{
font-size:22px;
font-weight:600;
}

.lang{
font-size:14px;
color:#666;
cursor:pointer;
}

/* ===== Upload ===== */

.upload{
border:2px dashed #e5e5e5;
border-radius:14px;
padding:48px;
text-align:center;
cursor:pointer;
transition:.2s;
}

.upload:hover{
border-color:#999;
background:#fafafa;
}

.upload input{display:none}

.upload-title{
font-size:16px;
margin-bottom:6px;
}

.upload-sub{
font-size:13px;
color:#777;
}

/* ===== File Card ===== */

.file-card{
margin-top:20px;
border:1px solid #eee;
border-radius:12px;
padding:16px;
display:none;
justify-content:space-between;
align-items:center;
}

.status{
font-size:12px;
padding:4px 10px;
border-radius:20px;
background:#eee;
}

/* ===== Mode ===== */

.section{
margin-top:28px;
}

.section-title{
font-size:13px;
color:#666;
margin-bottom:10px;
}

.options{
display:grid;
grid-template-columns:1fr 1fr 1fr;
gap:12px;
}

.option{
border:1px solid #eee;
padding:14px;
border-radius:10px;
text-align:center;
cursor:pointer;
}

.option:hover{
border-color:#999;
background:#fafafa;
}

/* ===== Button ===== */

button{
width:100%;
margin-top:28px;
padding:14px;
border:none;
border-radius:10px;
background:#111;
color:white;
font-size:15px;
cursor:pointer;
}

/* ===== Progress ===== */

.progress{
margin-top:20px;
height:6px;
background:#eee;
border-radius:3px;
overflow:hidden;
display:none;
}

.bar{
height:100%;
width:0%;
background:#111;
}

/* ===== Download ===== */

.download{
margin-top:20px;
display:none;
}

.download button{
background:#444;
}

</style>
</head>

<body>

<div class="app">

<div class="header">
<div class="logo" id="logo">云书排</div>
<div class="lang" onclick="toggleLang()">中 / EN</div>
</div>

<form id="form">

<label class="upload" id="uploadBox">
<div class="upload-title" id="uploadTitle">拖拽文件或点击上传</div>
<div class="upload-sub" id="uploadSub">支持 EPUB / TXT</div>
<input type="file" name="file" accept=".epub,.txt" required>
</label>

<div class="file-card" id="fileCard">
<div id="fileName"></div>
<div class="status" id="status">Ready</div>
</div>

<div class="section">
<div class="section-title" id="modeTitle">排版模式</div>

<div class="options">
<label class="option">
<input type="radio" name="mode" value="auto" checked> AI
</label>
<label class="option">
<input type="radio" name="mode" value="novel"> Novel
</label>
<label class="option">
<input type="radio" name="mode" value="compact"> Compact
</label>
</div>
</div>

<button type="submit" id="convertBtn">开始转换</button>

</form>

<div class="progress"><div class="bar" id="bar"></div></div>

<div class="download" id="downloadBox">
<button id="downloadBtn">下载文件</button>
</div>

</div>

<script>

/* ===== Language ===== */

let lang="zh"

function toggleLang(){
lang=lang==="zh"?"en":"zh"

logo.innerText=lang==="zh"?"云书排":"CloudBook"
uploadTitle.innerText=lang==="zh"?"拖拽文件或点击上传":"Drop or select file"
uploadSub.innerText=lang==="zh"?"支持 EPUB / TXT":"EPUB / TXT supported"
modeTitle.innerText=lang==="zh"?"排版模式":"Layout Mode"
convertBtn.innerText=lang==="zh"?"开始转换":"Convert"
downloadBtn.innerText=lang==="zh"?"下载文件":"Download"
}

/* ===== File ===== */

const input=document.querySelector('input[type=file]')
const fileCard=document.getElementById("fileCard")
const fileName=document.getElementById("fileName")
const status=document.getElementById("status")

input.onchange=e=>{
fileName.innerText=e.target.files[0].name
fileCard.style.display="flex"
}

/* ===== Upload ===== */

const form=document.getElementById("form")
const bar=document.getElementById("bar")
const progress=document.querySelector(".progress")
const downloadBox=document.getElementById("downloadBox")
let blob=null

form.onsubmit=e=>{
e.preventDefault()

status.innerText="Processing"
progress.style.display="block"

const fd=new FormData(form)
const xhr=new XMLHttpRequest()

xhr.open("POST","/")
xhr.responseType="arraybuffer"

xhr.upload.onprogress=e=>{
if(e.lengthComputable){
bar.style.width=(e.loaded/e.total*60)+"%"
}
}

xhr.onload=()=>{
bar.style.width="100%"
status.innerText="Done"
blob=new Blob([xhr.response],{type:"application/epub+zip"})
downloadBox.style.display="block"
}

xhr.send(fd)
}

/* ===== Download ===== */

downloadBtn.onclick=()=>{
if(!blob) return
const a=document.createElement("a")
a.href=URL.createObjectURL(blob)
a.download="converted.epub"
a.click()
}

/* ===== Drag Upload ===== */

const uploadBox=document.getElementById("uploadBox")

uploadBox.ondragover=e=>{
e.preventDefault()
uploadBox.style.borderColor="#111"
}

uploadBox.ondragleave=()=>{
uploadBox.style.borderColor="#e5e5e5"
}

uploadBox.ondrop=e=>{
e.preventDefault()
input.files=e.dataTransfer.files
input.onchange({target:input})
}

</script>

</body>
</html>
`,{
headers:{
"Content-Type":"text/html; charset=UTF-8"
}
})
}
/* ===== 处理转换 ===== */

try{

const form=await request.formData()
const file=form.get("file")
const mode=form.get("mode")||"auto"

if(!file) return new Response("未上传文件",{status:400})

const isTXT=file.name.toLowerCase().endsWith(".txt")
const isEPUB=file.name.toLowerCase().endsWith(".epub")

if(!isTXT && !isEPUB)
return new Response("仅支持 EPUB 或 TXT",{status:400})

let zip

if(isTXT){

const text=await file.text()
const strategy=mode==="auto"?decideLayout(text):mode
const css=generateCSS(strategy)
zip=await createEPUBFromTXT(text,css)

}else{

zip=await JSZip.loadAsync(await file.arrayBuffer())

let textSample=""

for(const name of Object.keys(zip.files)){
if(name.endsWith(".xhtml")||name.endsWith(".html")){
const html=await zip.file(name).async("string")
textSample+=extractText(html).slice(0,2000)
break
}
}

const strategy=mode==="auto"?decideLayout(textSample):mode
const css=generateCSS(strategy)

zip.file("publication.css",css)
zip.file("font.otf",base64ToArrayBuffer(FONT_BASE64))

for(const name of Object.keys(zip.files)){
if(name.endsWith(".xhtml")||name.endsWith(".html")){
let html=await zip.file(name).async("string")
html=html.replace(/<link[^>]*stylesheet[^>]*>/gi,"")
html=html.replace(/<head[^>]*>/i,
m=>m+'<link rel="stylesheet" href="publication.css"/>')
zip.file(name,html)
}
}
}

const output=await zip.generateAsync({type:"arraybuffer"})

return new Response(output,{
headers:{
"Content-Type":"application/epub+zip",
"Content-Disposition":"attachment; filename=converted.epub"
}
})

}catch(e){
return new Response("处理失败："+e.message,{status:500})
}

}
}
