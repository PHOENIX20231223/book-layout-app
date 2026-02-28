
import JSZip from "jszip"
import { parseHTML } from "linkedom"

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
  return `body{writing-mode:vertical-rl;line-height:1.9;letter-spacing:0.06em;margin:8% 6%;text-align:justify}
  p{text-indent:2em;margin-left:1.2em}`
 }
 if(strategy==="compact"){
  return `body{writing-mode:horizontal-tb;line-height:1.6;margin:5% 6%;text-align:justify}
  p{text-indent:2em}`
 }
 return `body{writing-mode:horizontal-tb;line-height:1.9;margin:6% 8%;text-align:justify}
 p{text-indent:2em}`
}

export default {
 async fetch(request){

 if (request.method === "GET") {
  return new Response(`
  <!DOCTYPE html>
  <html>
  <head>
  <meta charset="UTF-8">
  <title>云书排 · EPUB AI排版工具</title>
  <meta name="description" content="EPUB 自动排版 · 横竖排转换 · AI出版级排版">
  </head>

  <body style="font-family:sans-serif;padding:40px">

  <h1>云书排 · EPUB AI排版工具</h1>

  <form id="form">
  <input type="file" name="file" accept=".epub" required><br><br>

  <select name="mode">
  <option value="auto">AI自动（推荐）</option>
  <option value="horizontal">横排出版物</option>
  <option value="vertical">竖排阅读</option>
  <option value="novel">小说阅读</option>
  <option value="compact">紧凑排版</option>
  </select><br><br>

  <button type="submit">开始转换</button>
  </form>

  <hr>
  <p>永久免费使用。如有帮助，可支持开发者 ❤️</p>
  <a href="https://buymeacoffee.com/">支持开发者</a>

  <script>
  document.getElementById("form").onsubmit=async e=>{
    e.preventDefault()
    const fd=new FormData(e.target)
    const res=await fetch("/",{method:"POST",body:fd})
    const blob=await res.blob()
    const a=document.createElement("a")
    a.href=URL.createObjectURL(blob)
    a.download="converted.epub"
    a.click()
  }
  </script>

  </body>
  </html>
  `, { headers: { "Content-Type": "text/html" } })
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
    if(name.endsWith(".xhtml")||name.endsWith(".html")){
      const html=await zip.file(name).async("string")
      textSample+=extractText(html).slice(0,2000)
      break
    }
  }

  const strategy=mode==="auto"?decideLayout(textSample):mode
  const css=generateCSS(strategy)

  zip.file("publication.css",css)

  for(const name of Object.keys(zip.files)){
    if(name.endsWith(".xhtml")||name.endsWith(".html")){
      const html=await zip.file(name).async("string")
      const {document}=parseHTML(html)
      const link=document.createElement("link")
      link.rel="stylesheet"
      link.href="publication.css"
      document.head.appendChild(link)
      zip.file(name,document.toString())
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
