import JSZip from "jszip"

/* =============================
   字体（演示版）
============================= */

const FONT_BASE64 =
"AAEAAAALAIAAAwAwT1MvMg8SBJcAAAC8AAAAYGNtYXABdXUAAAF8AAABPGdhc3AAAAAQAAADHAAAAAhnbHlmAAAAAAADHAAAACBoZWFkAAABJAAAADZoaGVhAAABWAAAACRobXR4AAABeAAAABRsb2NhAAABkAAAABRtYXhwAAABsAAAACBuYW1lAAABzAAAADZwb3N0AAAB/AAAACBwcmVwAAACGAAAADYAAQAAAADMPaLPAAAAAMw9os8AAQAAAAA="

function base64ToArrayBuffer(base64){
const binary = atob(base64)
const bytes = new Uint8Array(binary.length)
for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i)
return bytes
}

/* =============================
   AI 排版策略
============================= */

function extractText(html){
return html.replace(/<[^>]+>/g,"")
}

function decideLayout(text){
if(text.length>50000) return "compact"
return "novel"
}

/* =============================
   CSS
============================= */

function generateCSS(strategy){

var fontFace =
'@font-face{' +
'font-family:"BookFont";' +
'src:url("font.otf");' +
'}'

if(strategy==="compact"){
return fontFace +
'body{font-family:"BookFont";line-height:1.6;margin:5% 6%;}' +
'p{text-indent:2em}'
}

return fontFace +
'body{font-family:"BookFont";line-height:1.85;margin:6% 8%;}' +
'p{text-indent:2em;margin-bottom:0.9em}'
}

/* =============================
   TXT 分章
============================= */

function splitChapters(text){

const lines=text.split(/\r?\n/)
let chapters=[]
let current={title:"正文",content:[]}

const reg=/^(第[0-9一二三四五六七八九十百千]+章|Chapter\s+\d+|\d+\.)/i

for(let i=0;i<lines.length;i++){
const line=lines[i]

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

zip.file("META-INF/container.xml",
'<?xml version="1.0"?>' +
'<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
'<rootfiles>' +
'<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>' +
'</rootfiles>' +
'</container>'
)

const chapters=splitChapters(text)

let manifest=""
let spine=""

for(let i=0;i<chapters.length;i++){

const ch=chapters[i]
const id="ch"+i

let content=""
for(let j=0;j<ch.content.length;j++){
content+="<p>"+ch.content[j]+"</p>"
}

const html =
'<?xml version="1.0" encoding="UTF-8"?>' +
'<html xmlns="http://www.w3.org/1999/xhtml">' +
'<head>' +
'<title>'+ch.title+'</title>' +
'<link rel="stylesheet" href="publication.css"/>' +
'</head>' +
'<body>' +
'<h2>'+ch.title+'</h2>' +
content +
'</body>' +
'</html>'

zip.file("OEBPS/"+id+".xhtml",html)

manifest+='<item id="'+id+'" href="'+id+'.xhtml" media-type="application/xhtml+xml"/>'
spine+='<itemref idref="'+id+'"/>'
}

zip.file("OEBPS/publication.css",css)
zip.file("OEBPS/font.otf",base64ToArrayBuffer(FONT_BASE64))

zip.file("OEBPS/content.opf",
'<package xmlns="http://www.idpf.org/2007/opf" version="3.0">' +
'<manifest>' +
'<item id="css" href="publication.css" media-type="text/css"/>' +
'<item id="font" href="font.otf" media-type="font/otf"/>' +
manifest +
'</manifest>' +
'<spine>'+spine+'</spine>' +
'</package>'
)

return zip
}

/* =============================
   Worker 主入口
============================= */

export default {
async fetch(request){

/* ===== UI ===== */

if(request.method==="GET"){
return new Response(
'<!DOCTYPE html>'+
'<html><head><meta charset="UTF-8"><title>CloudBook</title>'+
'<style>'+
'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto;background:#fff;color:#111}'+
'.container{max-width:520px;margin:120px auto;text-align:center;padding:0 24px}'+
'h1{font-size:28px;margin-bottom:8px}'+
'.subtitle{color:#666;margin-bottom:50px}'+
'.upload{border:1px solid #ddd;border-radius:16px;padding:50px;cursor:pointer}'+
'.upload input{display:none}'+
'.mode{margin-top:40px}'+
'button{margin-top:40px;width:100%;padding:16px;background:#111;color:#fff;border:none;border-radius:16px}'+
'</style></head>'+
'<body><div class="container">'+
'<h1>云书排</h1>'+
'<div class="subtitle">电子书排版工具</div>'+
'<form method="POST" enctype="multipart/form-data">'+
'<label class="upload">选择 EPUB 或 TXT<input type="file" name="file" accept=".epub,.txt" required></label>'+
'<div class="mode">'+
'<label><input type="radio" name="mode" value="auto" checked> AI </label>'+
'<label><input type="radio" name="mode" value="novel"> Novel </label>'+
'<label><input type="radio" name="mode" value="compact"> Compact </label>'+
'</div>'+
'<button>开始转换</button>'+
'</form></div></body></html>',
{headers:{"Content-Type":"text/html;charset=UTF-8"}}
)
}

/* ===== 处理 ===== */

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
}

/* EPUB */
else{

zip=await JSZip.loadAsync(await file.arrayBuffer())

let textSample=""

for(const name in zip.files){
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

for(const name in zip.files){
if(name.endsWith(".xhtml")||name.endsWith(".html")){
let html=await zip.file(name).async("string")
html=html.replace(/<link[^>]*stylesheet[^>]*>/gi,"")
html=html.replace(/<head[^>]*>/i,
function(m){return m+'<link rel="stylesheet" href="publication.css"/>'})
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
