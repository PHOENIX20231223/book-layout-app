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

/* ===== 全局 ===== */

body{
margin:0;
font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto;
background:#f3f4f6;
color:#111;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}

/* ===== 主容器 ===== */

.container{
background:#fff;
width:500px;
padding:50px;
border-radius:10px;
box-shadow:0 8px 30px rgba(0,0,0,0.06);
position:relative;
}

/* ===== 语言切换 ===== */

.lang-switch{
position:absolute;
top:18px;
right:20px;
font-size:14px;
cursor:pointer;
color:#666;
}

/* ===== 标题 ===== */

h1{
margin-top:0;
font-size:22px;
font-weight:600;
}

/* ===== 大文件选择按钮 ===== */

.file-input{
margin-top:20px;
border:2px dashed #ddd;
padding:30px;
border-radius:8px;
text-align:center;
cursor:pointer;
font-size:16px;
color:#555;
transition:all 0.2s;
}

.file-input:hover{
border-color:#999;
background:#fafafa;
}

.file-input input{
display:none;
}

/* ===== 单选 ===== */

.options{
margin-top:25px;
}

.option{
margin-bottom:12px;
font-size:15px;
}

/* ===== 按钮 ===== */

button{
margin-top:30px;
width:100%;
padding:14px;
background:#666;
color:white;
border:none;
border-radius:6px;
font-size:16px;
cursor:pointer;
}

button:disabled{
background:#bbb;
}

/* ===== 进度条 ===== */

.progress{
margin-top:25px;
height:6px;
background:#eee;
border-radius:3px;
overflow:hidden;
display:none;
}

.progress-bar{
height:100%;
width:0%;
background:#666;
transition:width 0.3s;
}

/* ===== 下载 ===== */

.download{
margin-top:25px;
display:none;
}

.download button{
background:#333;
}

</style>
</head>

<body>

<div class="container">

<div class="lang-switch" onclick="toggleLang()">中 / EN</div>

<h1 id="title">云书排 · 专业排版</h1>

<form id="form">

<label class="file-input">
<span id="fileText">点击选择 EPUB 或 TXT 文件</span>
<input type="file" name="file" accept=".epub,.txt" required>
</label>

<div class="options">
<div class="option">
<label><input type="radio" name="mode" value="auto" checked> <span id="autoText">AI自动</span></label>
</div>
<div class="option">
<label><input type="radio" name="mode" value="novel"> <span id="novelText">小说阅读</span></label>
</div>
<div class="option">
<label><input type="radio" name="mode" value="compact"> <span id="compactText">紧凑排版</span></label>
</div>
</div>

<button type="submit" id="submitBtn">开始转换</button>

</form>

<div class="progress">
<div class="progress-bar" id="progressBar"></div>
</div>

<div class="download" id="downloadBox">
<button id="downloadBtn">下载文件</button>
</div>

</div>

<script>

/* ===== 语言切换 ===== */

let currentLang="zh"

function toggleLang(){
currentLang=currentLang==="zh"?"en":"zh"

if(currentLang==="en"){
title.innerText="CloudBook · Professional Formatter"
fileText.innerText="Click to select EPUB or TXT file"
autoText.innerText="AI Auto"
novelText.innerText="Novel Mode"
compactText.innerText="Compact Mode"
submitBtn.innerText="Convert"
downloadBtn.innerText="Download File"
}else{
title.innerText="云书排 · 专业排版"
fileText.innerText="点击选择 EPUB 或 TXT 文件"
autoText.innerText="AI自动"
novelText.innerText="小说阅读"
compactText.innerText="紧凑排版"
submitBtn.innerText="开始转换"
downloadBtn.innerText="下载文件"
}
}

/* ===== 上传 ===== */

const form=document.getElementById("form")
const progress=document.querySelector(".progress")
const progressBar=document.getElementById("progressBar")
const downloadBox=document.getElementById("downloadBox")
const downloadBtn=document.getElementById("downloadBtn")
let downloadBlob=null

form.onsubmit=function(e){
e.preventDefault()

progress.style.display="block"
progressBar.style.width="10%"

const fd=new FormData(form)

const xhr=new XMLHttpRequest()
xhr.open("POST","/")

xhr.upload.onprogress=function(e){
if(e.lengthComputable){
let percent=(e.loaded/e.total)*50
progressBar.style.width=percent+"%"
}
}

xhr.onload=function(){
progressBar.style.width="100%"
setTimeout(()=>{
downloadBlob=new Blob([xhr.response],{type:"application/epub+zip"})
downloadBox.style.display="block"
},300)
}

xhr.responseType="arraybuffer"
xhr.send(fd)
}

downloadBtn.onclick=function(){
if(!downloadBlob) return
const a=document.createElement("a")
a.href=URL.createObjectURL(downloadBlob)
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
