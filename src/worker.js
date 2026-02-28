import JSZip from "jszip"

/* =============================
   思源宋体 Base64（示例字体）
   ⚠ 演示版（避免Worker过大）
   后面可换完整字体
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
   AI 排版判定
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
   出版级 CSS（含字体）
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
   TXT 自动章节识别
============================= */

function splitChapters(text){

const lines=text.split(/\r?\n/)
let chapters=[]
let current={title:"正文",content:[]}

const chapterRegex=/^(第[0-9一二三四五六七八九十百千]+章|Chapter\\s+\\d+|\\d+\\.)/i

for(const line of lines){

if(chapterRegex.test(line.trim())){
if(current.content.length){
chapters.push(current)
}
current={title:line.trim(),content:[]}
}else{
current.content.push(line)
}
}

chapters.push(current)
return chapters
}

/* =============================
   TXT → EPUB 生成（含目录）
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

// 生成章节文件
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

// 目录
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

if(request.method==="GET"){
return new Response("云书排运行中",{headers:{'Content-Type':'text/plain'}})
}

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

/* ===== TXT处理 ===== */
if(isTXT){

const text=await file.text()
const strategy=mode==="auto"?decideLayout(text):mode
const css=generateCSS(strategy)

zip=await createEPUBFromTXT(text,css)

/* ===== EPUB处理 ===== */
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
