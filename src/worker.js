import JSZip from "jszip"

/* =============================
   字体（演示版）
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
   AI 排版策略
============================= */

function extractText(html){
return html.replace(/<[^>]+>/g,"")
}

function classicalRatio(text){
const words="之乎者也焉其若乃则兮矣耳"
let count=0
for(const c of text) if(words.includes(c)) count++
return count/Math.max(text.length,1)
}

function decideLayout(text){
if(classicalRatio(text)>0.03) return "compact"
if(text.length>50000) return "compact"
return "novel"
}

/* =============================
   CSS
============================= */

function generateCSS(strategy){

const fontFace=`
@font-face{
font-family:"BookFont";
src:url("font.otf");
}
`

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
margin:6% 8%;
}
p{text-indent:2em;margin-bottom:0.9em}
`
}

/* =============================
   TXT 自动分章
============================= */

function splitChapters(text){

const lines=text.split(/\\r?\\n/)
let chapters=[]
let current={title:"正文",content:[]}

const reg=/^(第[0-9一二三四五六七八九十百千]+章|Chapter\\s+\\d+|\\d+\\.)/i

for(const line of lines){
if(reg.test(line.trim())){
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

chapters.forEach((ch,i)=>{
const id="ch"+i
const content = ch.content
  .map(p => "<p>" + p + "</p>")
  .join("")

zip.file(\`OEBPS/\${id}.xhtml\`,`
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>${ch.title}</title>
<link rel="stylesheet" href="publication.css"/>
</head>
<body>
<h2>${ch.title}</h2>
${content}
</body>
</html>`)

manifest+=\`<item id="\${id}" href="\${id}.xhtml" media-type="application/xhtml+xml"/>\`
spine+=\`<itemref idref="\${id}"/>\`
})

zip.file("OEBPS/publication.css",css)
zip.file("OEBPS/font.otf",base64ToArrayBuffer(FONT_BASE64))

zip.file("OEBPS/content.opf",`
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<manifest>
<item id="css" href="publication.css" media-type="text/css"/>
<item id="font" href="font.otf" media-type="font/otf"/>
${manifest}
</manifest>
<spine>${spine}</spine>
</package>`)

return zip
}

/* =============================
   Worker 主入口
============================= */

export default {
async fetch(request){

/* =============================
   前端 UI
============================= */

if(request.method==="GET"){
return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>CloudBook</title>

<style>
body{
margin:0;
font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto;
background:#ffffff;
color:#111;
}

.container{
max-width:520px;
margin:120px auto;
text-align:center;
padding:0 24px;
}

h1{
font-size:28px;
margin-bottom:8px;
font-weight:600;
}

.subtitle{
color:#666;
font-size:14px;
margin-bottom:60px;
}

.upload{
border:1px solid #ddd;
border-radius:16px;
padding:50px 30px;
cursor:pointer;
transition:.2s;
}

.upload:hover{
border-color:#111;
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

.file-name{
margin-top:16px;
font-size:13px;
color:#666;
display:none;
}

.mode{
margin-top:50px;
display:flex;
justify-content:center;
gap:12px;
}

.mode label{
border:1px solid #ddd;
padding:12px 20px;
border-radius:999px;
cursor:pointer;
font-size:14px;
}

.mode input{margin-right:6px}

button{
margin-top:50px;
width:100%;
padding:16px;
background:#111;
color:white;
border:none;
border-radius:16px;
font-size:16px;
cursor:pointer;
}

.status{
margin-top:24px;
color:#666;
font-size:14px;
}
</style>
</head>

<body>

<div class="container">

<h1>云书排</h1>
<div class="subtitle">专业电子书排版工具</div>

<form id="form">

<label class="upload">
<div class="upload-title">选择 EPUB 或 TXT 文件</div>
<div class="upload-sub">拖拽或点击上传</div>
<input type="file" name="file" accept=".epub,.txt" required>
</label>

<div class="file-name" id="fileName"></div>

<div class="mode">
<label><input type="radio" name="mode" value="auto" checked> AI</label>
<label><input type="radio" name="mode" value="novel"> Novel</label>
<label><input type="radio" name="mode" value="compact"> Compact</label>
</div>

<button>开始转换</button>

</form>

<div class="status" id="status"></div>

</div>

<script>

const input=document.querySelector('input[type=file]')
const fileName=document.getElementById("fileName")

input.onchange=e=>{
fileName.style.display="block"
fileName.innerText=e.target.files[0].name
}

form.onsubmit=async e=>{
e.preventDefault()
status.innerText="处理中..."

const fd=new FormData(form)
const res=await fetch("/",{method:"POST",body:fd})

if(!res.ok){
status.innerText="失败"
return
}

const blob=await res.blob()
const a=document.createElement("a")
a.href=URL.createObjectURL(blob)
a.download="converted.epub"
a.click()

status.innerText="完成"
}

</script>

</body>
</html>
`,{
headers:{ "Content-Type":"text/html; charset=UTF-8" }
})
}

/* =============================
   后端处理
============================= */

try{

const form=await request.formData()
const file=form.get("file")
const mode=form.get("mode")||"auto"

if(!file) return new Response("未上传文件",{status:400})

const isTXT=file.name.toLowerCase().endsWith(".txt")
const isEPUB=file.name.toLowerCase().endsWith(".epub")

if(!isTXT && !isEPUB){
return new Response("仅支持 EPUB 或 TXT",{status:400})
}

let zip

/* TXT */
if(isTXT){

const text=await file.text()
const strategy=mode==="auto"?decideLayout(text):mode
const css=generateCSS(strategy)
zip=await createEPUBFromTXT(text,css)

/* EPUB */
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
