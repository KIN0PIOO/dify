const vscode = require("vscode");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const API_URL = "https://ai-platform-deploy.koreacentral.cloudapp.azure.com:3000/v1/chat-messages";
const API_KEY = "app-Ek5DUANnjnWbczf5NekimGgE";

function activate(context) {

    const provider = {
        resolveWebviewView(webviewView) {
            webviewView.webview.options = { enableScripts: true };
            webviewView.webview.html = getHtml();

            webviewView.webview.onDidReceiveMessage(async (data) => {
                if (data.type === "send") {
                    const reply = await callDify(data.text, data.files || []);
                    webviewView.webview.postMessage({ type:"reply", text:reply });
                }
            });
        }
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("difyChatView", provider)
    );
}

async function callDify(text, files = []) {
    const res = await fetch(API_URL, {
        method:"POST",
        headers:{
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type":"application/json"
        },
        body:JSON.stringify({
            query: text,
            inputs: {},
            response_mode: "blocking",
            user: "vscode-user",
            files: files
        })
    }).then(r=>r.json());

    return res?.answer ?? JSON.stringify(res);
}

function getHtml(){
return `
<style>
body { font-family: sans-serif; padding: 10px; }
#chat { height: 300px; border:1px solid #333; padding:10px; overflow-y:auto; margin-bottom:10px; }
textarea{width:100%;height:60px;margin-top:5px;}
button{margin-top:5px;width:100%;padding:10px;background:#4F8BFF;color:white;border:none;cursor:pointer;}
#fileInput{margin-top:5px;width:100%;}
.file-info{background:#f0f0f0;padding:5px;margin-top:5px;border-radius:3px;font-size:12px;}
.remove-file{margin-left:10px;color:red;cursor:pointer;}
</style>

<h2>Dify Chat</h2>
<div id="chat"></div>
<input type="file" id="fileInput" multiple />
<div id="fileList"></div>
<textarea id="input" placeholder="메시지 입력..."></textarea>
<button id="send">Send</button>

<script>
const vscode = acquireVsCodeApi();
const chat=document.getElementById("chat");
const input=document.getElementById("input");
const fileInput=document.getElementById("fileInput");
const fileList=document.getElementById("fileList");
let selectedFiles = [];

fileInput.onchange = async (e) => {
    const files = Array.from(e.target.files);
    for(const file of files) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target.result.split(',')[1];
            selectedFiles.push({
                type: "transfer_method",
                transfer_method: "local_file",
                upload_file_id: "",
                url: base64
            });
            updateFileList();
        };
        reader.readAsDataURL(file);
    }
    fileInput.value = "";
};

function updateFileList() {
    fileList.innerHTML = selectedFiles.map((f, i) =>
        '<div class="file-info">파일 ' + (i+1) + '<span class="remove-file" onclick="removeFile('+i+')">✕</span></div>'
    ).join('');
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
}

document.getElementById("send").onclick = ()=>{
    if(!input.value.trim()) return;
    const msg = input.value;
    const files = [...selectedFiles];
    add("You", msg + (files.length > 0 ? ' [파일 ' + files.length + '개]' : ''));
    vscode.postMessage({type:"send", text:msg, files:files});
    input.value="";
    selectedFiles = [];
    updateFileList();
};

window.addEventListener("message",(e)=>{
    if(e.data.type==="reply") add("Dify",e.data.text);
});

function add(who,msg){
    chat.innerHTML += "<p><b>"+who+":</b> "+msg+"</p>";
    chat.scrollTop = chat.scrollHeight;
}
</script>
`;
}

function deactivate(){}
module.exports = { activate, deactivate };
