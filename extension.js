const vscode = require("vscode");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const API_URL = "https://ai-platform-deploy.koreacentral.cloudapp.azure.com:3000/v1/chat-messages";
const API_KEY = "app-Ek5DUANnjnWbczf5NekimGgE";

/* ==========================================================
    EXTENSION ENTRY
=========================================================== */
function activate(context) {

    const provider = {
        resolveWebviewView(webviewView) {
            webviewView.webview.options = { enableScripts: true };
            webviewView.webview.html = getHtml();

            webviewView.webview.onDidReceiveMessage(async (data) => {
                if(data.type === "send"){
                    const reply = await callDify(data.text, data.files);
                    webviewView.webview.postMessage({ type:"reply", text:reply });
                }
            });
        }
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("difyChatView", provider)
    );
}

/* ==========================================================
    🔥 md_upload = [{name,type,base64}] 형식으로 변환하여 전송
=========================================================== */
async function callDify(text, files) {

    /**
     * 📌 변환 규칙
     *  files = [{name, base64WithMime}]
     *  ↓↓↓
     *  inputs.md_upload = [{name,type:"base64",base64}]
     */
    const md_upload = files.map(f => ({
        name: f.name,
        type: "base64",
        base64: f.base64.replace(/^data:.*;base64,/, "")  // MIME 제거 필수
    }));

    const payload = {
        query: text || " ",
        inputs: { md_upload },  // 🔥 Dify 요구 형식 충족
        response_mode: "blocking",
        user: "vscode-vsc"
    };

    const res = await fetch(API_URL, {
        method:"POST",
        headers:{
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type":"application/json"
        },
        body:JSON.stringify(payload)
    }).then(r=>r.json());

    return res?.answer || res?.text || JSON.stringify(res,null,2);
}

/* ==========================================================
   WEBVIEW UI — Base64 파일을 md_upload Object로 만들도록 수정
=========================================================== */
function getHtml(){
return `
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Segoe UI,Roboto;height:100vh;display:flex;flex-direction:column;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}
.header{padding:14px 18px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:10px}
.logo{width:22px;height:22px;border-radius:6px;background:#667eea;color:white;font-weight:bold;display:flex;align-items:center;justify-content:center}
#chat{flex:1;padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.message{display:flex;gap:10px}
.message.user{flex-direction:row-reverse}
.avatar{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold}
.message.user .avatar{background:#667eea;color:#fff}
.message.assistant .avatar{background:#444;color:#fff}
.message-content{max-width:75%;padding:10px 14px;border-radius:12px;line-height:1.45}
.message.user .message-content{background:#667eea;color:white}
.message.assistant .message-content{background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}

.input-container{padding:12px 18px;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}
#fileList{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.file-info{padding:6px 10px;border-radius:12px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.remove-file{cursor:pointer;margin-left:6px}
textarea{flex:1;padding:10px;border-radius:10px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);color:var(--vscode-input-foreground)}
button{padding:10px 16px;border:none;border-radius:10px;background:#667eea;color:white;font-weight:bold;cursor:pointer}
.file-upload-btn{padding:10px;background:var(--vscode-button-secondaryBackground);border-radius:10px;cursor:pointer}
#fileInput{display:none}
</style>

<div class="header"><div class="logo">D</div><b>Dify Chat</b></div>
<div id="chat"></div>

<div class="input-container">
    <div id="fileList"></div>
    <div style="display:flex;gap:8px">
        <label for="fileInput" class="file-upload-btn">📎</label>
        <input id="fileInput" type="file" multiple />
        <textarea id="input" placeholder="메시지를 입력하세요..."></textarea>
        <button id="send">전송</button>
    </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let uploadedFiles=[];

// Base64 + 파일명 저장
fileInput.onchange = e=>{
    [...e.target.files].forEach(file=>{
        const r=new FileReader();
        r.onload = x =>{
            uploadedFiles.push({ name:file.name, base64:x.target.result });
            updateUI();
        };
        r.readAsDataURL(file);
    });
    e.target.value="";
};

function updateUI(){
    fileList.innerHTML="";
    uploadedFiles.forEach((f,i)=>{
        fileList.innerHTML += \`<div class="file-info">📄 \${f.name}<span class="remove-file" onclick="removeFile(\${i})">✕</span></div>\`;
    });
}
function removeFile(i){ uploadedFiles.splice(i,1); updateUI(); }

// 전송 handler
send.onclick=()=>{
    const text = input.value.trim();
    if(!text && uploadedFiles.length===0) return;

    addMsg("user", text || "(📄 파일 "+uploadedFiles.length+"개)");
    vscode.postMessage({
        type:"send",
        text:text,
        files: uploadedFiles        // 🔥 md_upload object 생성용 원본 전달
    });

    input.value="";
    uploadedFiles=[]; updateUI();
};

// 응답
window.addEventListener("message",e=>{
    if(e.data.type==="reply") addMsg("assistant",e.data.text);
});

// 메시지 렌더
function addMsg(role,msg){
    chat.innerHTML += \`
    <div class="message \${role}">
    <div class="avatar">\${role=="user"?"U":"D"}</div>
    <div class="message-content">\${msg}</div>
    </div>\`;
    chat.scrollTop = chat.scrollHeight;
}
</script>
`;
}

function deactivate(){}
module.exports = { activate, deactivate };
