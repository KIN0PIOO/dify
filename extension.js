const vscode = require("vscode");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const API_URL = "https://ai-platform-deploy.koreacentral.cloudapp.azure.com:3000/v1/chat-messages";
const UPLOAD_API_URL = "https://ai-platform-deploy.koreacentral.cloudapp.azure.com:3000/v1/files/upload";
const API_KEY = "app-Ek5DUANnjnWbczf5NekimGgE";

/* ==========================================================
    VSCode Extension Entry
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

async function uploadFileToDify(file) {
    const FormData = (await import("formdata-polyfill/esm.min.js")).FormData;
    const Blob = (await import("fetch-blob")).Blob;

    // base64를 Blob으로 변환
    const base64Data = file.base64.replace(/^data:.*;base64,/, "");
    const binaryData = Buffer.from(base64Data, "base64");
    const blob = new Blob([binaryData], { type: "application/octet-stream" });

    const formData = new FormData();
    formData.append("file", blob, file.name);
    formData.append("user", "vscode-extension");

    try {
        const res = await fetch(UPLOAD_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            },
            body: formData
        });

        const data = await res.json();

        if (data.id) {
            return data.id;
        } else {
            throw new Error(data.message || "파일 업로드 실패");
        }
    } catch (e) {
        throw new Error(`파일 업로드 실패: ${e.message}`);
    }
}

async function callDify(text, files) {
    // 파일 필수 검증
    if (!Array.isArray(files) || files.length === 0) {
        return "⚠️ 파일을 먼저 업로드해주세요. (.md 파일 필수)";
    }

    try {
        // 1단계: 파일들을 Dify에 업로드하여 upload_file_id 받기
        const uploadPromises = files.map(f => uploadFileToDify(f));
        const uploadFileIds = await Promise.all(uploadPromises);

        // 2단계: md_upload 형식으로 변환
        const md_upload = uploadFileIds.map((fileId, idx) => ({
            type: detectType(files[idx].name),
            transfer_method: "local_file",
            upload_file_id: fileId
        }));

        const payload = {
            query: text || "",
            inputs: { md_upload },
            response_mode: "blocking",
            user: "vscode-extension"
        };

        const res = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.code) {
            return `❌ 에러: ${data.message || JSON.stringify(data)}`;
        }

        return data.answer || JSON.stringify(data, null, 2);
    } catch (e) {
        return `❌ 요청 실패: ${e.message}`;
    }
}

function detectType(name) {
    if (!name) return "document";
    const ext = name.split(".").pop().toLowerCase();

    if (["md", "markdown"].includes(ext)) return "document";
    if (["txt"].includes(ext)) return "document";
    if (["pdf"].includes(ext)) return "document";

    return "document";
}

/* ==========================================================
    WebView UI - (파일 업로드 → Base64 저장 → md_upload 전송)
=========================================================== */
function getHtml(){return `
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Segoe UI,Roboto;height:100vh;display:flex;flex-direction:column;
background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}
.header{padding:14px 18px;background:var(--vscode-sideBar-background);
border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:10px}
.logo{width:22px;height:22px;border-radius:6px;background:#667eea;color:white;font-weight:bold;
display:flex;align-items:center;justify-content:center}
#chat{flex:1;padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.message{display:flex;gap:10px}
.message.user{flex-direction:row-reverse}
.avatar{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;
justify-content:center;font-weight:bold}
.message.user .avatar{background:#667eea;color:#fff}
.message.assistant .avatar{background:#444;color:#fff}
.message-content{max-width:75%;padding:10px 14px;border-radius:12px;line-height:1.45}
.message.user .message-content{background:#667eea;color:white}
.message.assistant .message-content{background:var(--vscode-input-background);
border:1px solid var(--vscode-input-border)}
.input-container{padding:12px 18px;border-top:1px solid var(--vscode-panel-border);
background:var(--vscode-sideBar-background)}
#fileList{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.file-info{padding:6px 10px;border-radius:12px;background:var(--vscode-badge-background);
color:var(--vscode-badge-foreground)}
.remove-file{cursor:pointer;margin-left:6px}
textarea{flex:1;padding:10px;border-radius:10px;background:var(--vscode-input-background);
border:1px solid var(--vscode-input-border);color:var(--vscode-input-foreground)}
button{padding:10px 16px;border:none;border-radius:10px;background:#667eea;color:white;
font-weight:bold;cursor:pointer}
.file-upload-btn{padding:10px;background:var(--vscode-button-secondaryBackground);
border-radius:10px;cursor:pointer}
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

// 파일→Base64→md_upload 원본 데이터화
fileInput.onchange = e=>{
    [...e.target.files].forEach(file=>{
        const r=new FileReader();
        r.onload = x =>{
            uploadedFiles.push({ name:file.name, base64:x.target.result });
            renderFiles();
        };
        r.readAsDataURL(file);
    });
    e.target.value="";
};

function renderFiles(){
    fileList.innerHTML="";
    uploadedFiles.forEach((f,i)=>{
        fileList.innerHTML+=\`<div class="file-info">📄 \${f.name}<span class="remove-file" onclick="del(\${i})">✕</span></div>\`;
    });
}
function del(i){uploadedFiles.splice(i,1);renderFiles();}

send.onclick = ()=>{
    const text = input.value.trim();

    // 파일이 없으면 전송 불가
    if(uploadedFiles.length === 0) {
        addMsg("assistant", "⚠️ 먼저 .md 파일을 업로드해주세요!");
        return;
    }

    addMsg("user", text || "파일 분석 요청");
    vscode.postMessage({type:"send", text, files:uploadedFiles});

    input.value="";
    uploadedFiles=[];
    renderFiles();
};

window.addEventListener("message",e=>{
    if(e.data.type==="reply") addMsg("assistant",e.data.text);
});

function addMsg(role,msg){
    chat.innerHTML+=\`
    <div class="message \${role}">
      <div class="avatar">\${role=="user"?"U":"D"}</div>
      <div class="message-content">\${msg}</div>
    </div>\`;
    chat.scrollTop=chat.scrollHeight;
}
</script>
`;}

/* ========================================================== */
function deactivate(){}
module.exports={activate,deactivate};
