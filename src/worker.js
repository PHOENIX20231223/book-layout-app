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

/* ===== 基础 ===== */

*{box-sizing:border-box}

body{
margin:0;
font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica;
background:#fafafa;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
color:#111;
}

/* ===== 主卡片 ===== */

.card{
width:520px;
background:white;
border-radius:16px;
padding:48px;
box-shadow:0 20px 60px rgba(0,0,0,0.06);
}

/* ===== 标题区 ===== */

.header{
margin-bottom:36px;
}

.title{
font-size:24px;
font-weight:600;
margin-bottom:6px;
}

.subtitle{
color:#777;
font-size:14px;
}

/* ===== 上传区 ===== */

.upload{
border:2px dashed #e5e5e5;
border-radius:12px;
padding:40px;
text-align:center;
cursor:pointer;
transition:all .2s;
margin-bottom:28px;
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
color:#888;
}

/* ===== 选项 ===== */

.section-title{
font-size:13px;
color:#666;
margin-bottom:10px;
}

.options{
display:flex;
gap:20px;
margin-bottom:30px;
}

.option{
flex:1;
border:1px solid #eee;
border-radius:10px;
padding:14px;
cursor:pointer;
transition:.2s;
}

.option:hover{
border-color:#999;
}

.option input{
margin-right:6px;
}

/* ===== 按钮 ===== */

button{
width:100%;
padding:14px;
border:none;
border-radius:10px;
background:#111;
color:white;
font-size:15px;
cursor:pointer;
transition:.2s;
}

button:hover{opacity:.9}

/* ===== 进度 ===== */

.progress{
margin-top:24px;
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
transition:.3s;
}

/* ===== 下载 ===== */

.download{
margin-top:24px;
display:none;
}

.download button{
background:#444;
}

/* ===== 语言 ===== */

.lang{
position:absolute;
top:20px;
right:24px;
font-size:14px;
color:#777;
cursor:pointer;
}

</style>
</head>

<body>

<div class="lang" onclick="toggleLang()">中 / EN</div>

<div class="card">

<div class="header">
<div class="title" id="title">云书排</div>
<div class="subtitle" id="subtitle">专业电子书排版工具</div>
</div>

<form id="form">

<label class="upload">
<div class="upload-title" id="uploadTitle">选择文件</div>
<div class="upload-sub" id="uploadSub">支持 EPUB 或 TXT</div>
<input type="file" name="file" accept=".epub,.txt" required>
</label>

<div class="section-title" id="modeTitle">排版模式</div>

<div class="options">

<label class="option">
<input type="radio" name="mode" value="auto" checked>
<span id="autoText">AI自动</span>
</label>

<label class="option">
<input type="radio" name="mode" value="novel">
<span id="novelText">小说阅读</span>
</label>

<label class="option">
<input type="radio" name="mode" value="compact">
<span id="compactText">紧凑排版</span>
</label>

</div>

<button type="submit" id="submitBtn">开始转换</button>

</form>

<div class="progress"><div class="bar" id="bar"></div></div>

<div class="download" id="downloadBox">
<button id="downloadBtn">下载文件</button>
</div>

</div>

<script>

/* ===== 语言切换 ===== */

let lang="zh"

function toggleLang(){
lang=lang==="zh"?"en":"zh"

if(lang==="en"){
title.innerText="CloudBook"
subtitle.innerText="Professional ebook formatter"
uploadTitle.innerText="Select File"
uploadSub.innerText="EPUB or TXT supported"
modeTitle.innerText="Layout Mode"
autoText.innerText="AI Auto"
novelText.innerText="Novel"
compactText.innerText="Compact"
submitBtn.innerText="Convert"
downloadBtn.innerText="Download"
}else{
title.innerText="云书排"
subtitle.innerText="专业电子书排版工具"
uploadTitle.innerText="选择文件"
uploadSub.innerText="支持 EPUB 或 TXT"
modeTitle.innerText="排版模式"
autoText.innerText="AI自动"
novelText.innerText="小说阅读"
compactText.innerText="紧凑排版"
submitBtn.innerText="开始转换"
downloadBtn.innerText="下载文件"
}
}

/* ===== 上传逻辑 ===== */

const form=document.getElementById("form")
const progress=document.querySelector(".progress")
const bar=document.getElementById("bar")
const downloadBox=document.getElementById("downloadBox")
const downloadBtn=document.getElementById("downloadBtn")

let blob=null

form.onsubmit=e=>{
e.preventDefault()

progress.style.display="block"
bar.style.width="15%"

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
blob=new Blob([xhr.response],{type:"application/epub+zip"})
downloadBox.style.display="block"
}

xhr.send(fd)
}

downloadBtn.onclick=()=>{
if(!blob) return
const a=document.createElement("a")
a.href=URL.createObjectURL(blob)
a.download="converted.epub"
a.click()
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
