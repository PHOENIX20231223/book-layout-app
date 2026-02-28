
import JSZip from "jszip"
import { parseHTML } from "linkedom"

/* =============================
   出版级 EPUB 清洗工具
============================= */


// 删除原有 CSS link
function removeOldCSS(html){
  return html.replace(/<link[^>]*stylesheet[^>]*>/gi,"")
}



// XHTML 自闭合修复
function fixSelfClosing(html){
  return html
    .replace(/<br>/g,"<br/>")
    .replace(/<hr>/g,"<hr/>")
    .replace(/<img([^>]*)>/g,"<img$1/>")
}



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

function generateCSS(strategy){

if(strategy==="vertical"){
return `
body{
writing-mode:vertical-rl;
line-height:1.9;
letter-spacing:0.06em;
margin:8% 6%;
text-align:justify;
}
p{text-indent:2em;margin-left:1.2em}
h1,h2,h3{text-align:center}
`
}

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
export default {
 async fetch(request){

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
color:#333;
}

.card{
background:white;
padding:40px;
border-radius:16px;
width:420px;
box-shadow:0 20px 60px rgba(0,0,0,0.2);
text-align:center;
}

h1{
margin-top:0;
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

button:hover{
background:#5a67d8;
}

#loading{
display:none;
margin-top:20px;
}

.footer{
margin-top:20px;
font-size:14px;
color:#777;
}
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

<div class="footer">
永久免费使用 ❤️<br>
<a href="https://buymeacoffee.com/" target="_blank">支持开发者</a>
</div>

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

  const form=await request.formData()
  const file=form.get("file")
  const mode=form.get("mode")||"auto"

  if(!file||!file.name.endsWith(".epub")){
    return new Response("仅支持EPUB",{status:400})
  }

  const zip=await JSZip.loadAsync(await file.arrayBuffer())

  let textSample=""
for(const name of Object.keys(zip.files)){

  if(name.endsWith(".xhtml") || name.endsWith(".html")){

    let html = await zip.file(name).async("string")

    // 1️⃣ 最小修复
    html = fixXHTML(html)

    // 2️⃣ 删除旧CSS引用（保留结构）
    html = removeOldCSSLinks(html)

    // 3️⃣ 安全注入出版CSS
    if(!html.includes("publication.css")){
      html = html.replace(
        /<head[^>]*>/i,
        match => match + '\\n<link rel="stylesheet" type="text/css" href="publication.css"/>'
      )
    }

    zip.file(name, html)
  }

  // 删除旧CSS文件（只删除文件，不动HTML）
  if(name.endsWith(".css") && name !== "publication.css"){
    delete zip.files[name]
  }
}

  const strategy=mode==="auto"?decideLayout(textSample):mode
  const css=generateCSS(strategy)

  if(!zip.files["publication.css"]){
  zip.file("publication.css",css)
}

for(const name of Object.keys(zip.files)){

  if(name.endsWith(".xhtml") || name.endsWith(".html")){

    let html = await zip.file(name).async("string")

    // 1️⃣ 出版级清洗
    html = cleanHTML(html)

    // 2️⃣ 安全注入CSS
    if(!html.includes("publication.css")){
      html = html.replace(
        /<head[^>]*>/i,
        match => match + '\\n<link rel="stylesheet" href="publication.css"/>'
      )
    }

    zip.file(name, html)
  }

  // 3️⃣ 删除原CSS文件（关键）
  if(name.endsWith(".css") && name !== "publication.css"){
    delete zip.files[name]
  }
}

  const output=await zip.generateAsync({type:"arraybuffer"})

  return new Response(output,{
    headers:{
      "Content-Type":"application/epub+zip",
      "Content-Disposition":"attachment; filename=converted.epub"
    }
  })
 }
}
