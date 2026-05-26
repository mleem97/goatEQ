function scope(){
var e=chrome.runtime.getManifest().version;
var t=localStorage;
var p=null;
// GA script injection removed for MV3 compatibility
var N=function(){
}
;
document.addEventListener("DOMContentLoaded",function(e){
chrome.runtime.sendMessage({type:"initPopup"}, function(response) {
console.log("Popup received initPopup response:", response);
_();
n();
a();
});
}
);
document.addEventListener("DOMContentLoaded",function(){
var n=document.getElementById("presetNameInput");
var e=document.getElementById("resetFiltersButton");
e.onclick=function(){
n.value="";
chrome.runtime.sendMessage({
type:"resetFilters"}
)}
;
var t=document.getElementById("bassBoostButton");
t.onclick=function(){
n.value="";
chrome.runtime.sendMessage({
type:"preset",preset:"bassBoost"}
)}
;
var r=document.getElementById("requiresProDiv");
function a(e){
r.textContent=e;
r.classList.add("show");
setTimeout(function(){
r.classList.remove("show")}
,5e3)}
var _selectedPreset=null;
var i=document.getElementById("savePresetButton");
i.onclick=function(){
var e=n.value.trim();
if(e!=""){
chrome.runtime.sendMessage({
type:"savePreset",preset:e});
n.value="";
n.classList.add("hidden")}
else{
n.classList.remove("hidden");
n.focus()}
}
;
var o=document.getElementById("deletePresetButton");
o.onclick=function(){
if(_selectedPreset){
chrome.runtime.sendMessage({
type:"deletePreset",preset:_selectedPreset});
_selectedPreset=null}
}
;
n.onkeypress=function(e){
if(!e)e=window.event;
var t=e.keyCode||e.which;
if(t=="13"&&document.activeElement==n){
i.click();
return false}
}
;
var s=document.getElementById("exportPresetsButton");
s.onclick=function(){
chrome.runtime.sendMessage({
type:"getPresetsForExport"}, function(response) {
if (response && response.presets) {
var n=document.createElement("a");
var r=new Blob([JSON.stringify(response.presets, null, 2)],{
type:"text/plain;charset=UTF-8"}
);
n.href=window.URL.createObjectURL(r);
n.download="goatEQ_Presets.json";
n.style.display="none";
document.body.appendChild(n);
n.click();
n.remove();
}
}
)}
;
var c=document.getElementById("importPresetsButton");
var u=document.getElementById("importPresetsFile");
c.onclick=function(){
u.click()}
;
u.onchange=function(){
var e=u.files;
for(var t=0;
t<e.length;
t++){
var n=new FileReader;
n.onload=function(e){
chrome.runtime.sendMessage({
type:"importPresets",presets:JSON.parse(e.target.result)}
)}
;
n.readAsText(e[t])}
}
;
var l=document.getElementById("vizButton");
function f(){
if(y()){
l.classList.add("on")}
else{
l.classList.remove("on")}
}
f();
l.onclick=function(){
H();
f()}
;
var v=["tab-1","tab-2","tab-3"];
for(var d=0;
d<v.length;
d++){
var h=v[d];
document.getElementById(h).addEventListener("change",function(e){
return function(){
if(this.checked){
localStorage["last-tab"]=e}
}
}
(h))}
var m=localStorage["last-tab"];
if(m){
var g=document.getElementById(m);
if(g){
g.click()}
}
var fwBtn = document.getElementById("fullwindowBtn");
if (fwBtn) {
fwBtn.onclick = function() { window.open(chrome.runtime.getURL("popup.html"), "_blank"); }
}
if(window.innerWidth&&window.innerWidth>1e3){
if(fwBtn) fwBtn.style.display="none"}
document.querySelectorAll(".guide-topic").forEach(function(btn){
btn.addEventListener("click",function(){
document.querySelectorAll(".guide-topic").forEach(function(b){b.classList.remove("active")});
document.querySelectorAll(".guide-content").forEach(function(c){c.classList.add("hidden")});
this.classList.add("active");
document.getElementById("guide-"+this.getAttribute("data-topic")).classList.remove("hidden")})})
}
);
function n(){
chrome.runtime.sendMessage({
type:"getFullRefresh"}
)}
function _(){
chrome.runtime.sendMessage({
type:"onPopupOpen"}
)}
var E=44100;
var O="eqSvg";
var z="eqTabButton";
var A="Enjoy your audio with goatEQ! Gain Optimization & Audio Treatment for your browser.";
var D="";
var i=true;
var r=function(){
if(i){
n();
setTimeout(r,1e3)}
}
;
setTimeout(r,1e3);
chrome.runtime.onMessage.addListener(function(e,t,n){
if(e.type=="sendCurrentTabStatus"){
if(e.streaming){
G()}
else{
W()}
}
if(e.type=="sendWorkspaceStatus"){
i=false;
J(e)}
if(e.type=="sendSampleRate"){
E=e.Fs;
console.log("set sample rate to "+E)}
if(e.type=="sendPresets"){
j(e)}
if(e.type=="F"){
var r=document.getElementById(O);
if(r){
r.remove()}
var a=document.getElementById(z);
if(a){
a.remove()}
document.getElementById("lt").textContent=A;
document.getElementById("pl").style.display="block"}
}
);
function U(e){
if(S){var t=1e3/30-(performance.now()-S);if(t>0){setTimeout(h,t);return}}
S=performance.now();
if(C){C.remove()}
if(!y()){return}
var n=e.fft;
var nb=e.fftBefore;
if(I&&n&&n.length>0){
strokeGradient=I.gradient("l(.5, 0, .5, 1)"+m+"-"+q);
function a(e){var y=B-1-e;if(y<0)return 0;if(y>B)return B;return y;}
function proc(arr){
var r=[];
for(var i in arr){var o=i*E/(arr.length*2);if(o<10)continue;var s=P(o);if(s>T)break;var c=(arr[i]+100)/100*B;r.push([s,c])}
var u=[];
for(var i in r){var l=r[i];if(u.length==0){u.push(l);continue}var f=u[u.length-1];var v=2;if(l[0]-f[0]<v){if(l[1]>f[1]){f[1]=l[1]}}else{u.push(l)}}
var d=[];
for(var i in u){var f=u[i];d=d.concat([f[0],a(f[1])])}
return d;
}
var polys = [];
if (nb && nb.length > 0) {
  polys.push(I.polyline(proc(nb)).attr({"fill-opacity":"0",stroke:strokeGradient,"stroke-opacity":"0.3","stroke-dasharray":"2,2","pointer-events":"none"}));
}
polys.push(I.polyline(proc(n)).attr({"fill-opacity":"0",stroke:strokeGradient,"pointer-events":"none"}));
C = I.g.apply(I, polys);
}
h()
}
function h(){
chrome.runtime.sendMessage({
type:"getFFT"}
,U)}
function j(e){
var t=e.presets;
var n=document.getElementById("userPresetSpan");
while(n.firstChild){
n.removeChild(n.firstChild)}
var r=Object.keys(t);
for(var a=0;
a<r.length;
a++){
(function(e){
var t=document.createElement("button");
t.className="bottom-tab";
t.textContent=e;
n.appendChild(t);
t.onclick=function(){
chrome.runtime.sendMessage({
type:"preset",preset:e}
);
document.getElementById("presetNameInput").value=e;
_selectedPreset=e}
}
)(r[a])}
}
function a(){
chrome.runtime.sendMessage({
type:"eqTab",on:true}
)}
function W(){
var e=document.getElementById("eqTabButton");
e.onclick=function(){
a()}
;
e.textContent="EQ This Tab"}
function G(){
var e=document.getElementById("eqTabButton");
e.onclick=function(){
chrome.runtime.sendMessage({
type:"eqTab",on:false}
)}
;
e.textContent="Stop EQing This Tab"}
var o="SHOW_VISUALIZER";
function y(){
return localStorage[o]==true}
function H(){
if(p){
return}
t[o]^=true;
if(y()){
h()}
}
var s=[];
function J(e){
s=[];
for(var t=0;
t<e.eqFilters.length;
t++){
var n=e.eqFilters[t];
var r={
}
;
r.x=P(n.frequency);
r.y=F(n.gain);
var a=n.frequency/n.q;
r.w=n.frequency/n.q;
r.t=n.type;
r.gain=n.gain;
r.q=n.q;
r.frequency=n.frequency;
s.push(r)}
var i={
}
;
i.gain=e.gain;
i.y=F(fe(i.gain));
$(s,i);
K(e.streams)}
function K(e){
var t=document.getElementById("eqTabList");
t.innerHTML="";
var fo=document.getElementById("folderIconOutline"),fs=document.getElementById("folderIconSolid");
if(fo&&fs){
if(e.length>0){fo.classList.add("hidden");fs.classList.remove("hidden")}
else{fo.classList.remove("hidden");fs.classList.add("hidden")}}
if(e.length==0){
t.textContent="No tabs active. Click 'EQ This Tab' below to activate this tab.";
return}
var n=document.createElement("table");
for(var r=0;
r<e.length;
r++){
n.appendChild(V(e[r]))}
t.appendChild(n)}
function V(e){
var t=document.createElement("tr");
var n=document.createElement("button");
n.textContent="Stop EQing";
n.onclick=function(){
chrome.runtime.sendMessage({
type:"disconnectTab",tab:e}
)}
;
var r=document.createElement("img");
r.className="tabFavIcon";
r.src=e.favIconUrl;
r.alt="";
n.appendChild(r);
var a=document.createElement("td");
a.appendChild(n);
t.appendChild(a);
var i=document.createElement("td");
var o=e.title;
if(o.length>45){
o=o.substring(0,45)}
i.textContent=o;
t.appendChild(i);
return t}
function Y(e){
return Math.log(e)/Math.log(2)}
var m="#FF7F00";
var q="#2A2D34";
var b="#9573A8";
var w="#CDF7E1";
var T=600;
var B=300;
var g=30;
var c=22050;
var u=30;
var M=10;
var k=-30;
var Z=0;
var X=0;
var I=null;
var C=null;
var S=null;
var x=null;
var _circleDotPath="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0";
var _circleDotFilledPath="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-5 6.66a2 2 0 0 0 -1.977 1.697l-.018 .154l-.005 .149l.005 .15a2 2 0 1 0 1.995 -2.15z";
var _dotScale=0.6;
function $(e,t){
if(I){
I.clear()}
if(x){
x.clear()}
I=Snap("#eqSvg");
I.attr({
fill:q}
);
x=Snap("#gainSvg");
x.attr({
fill:q}
);
var n={
fill:m,stroke:m}
;
var r=I.rect(0,0,T,B).attr({
stroke:m}
);
re(I,e);
ae(I);
var a=x.line(g/2,F(k),g/2,F(M)).attr({
stroke:"#FF7F00",opacity:.5}
);
var i=x.text(g/2,F(M)-10,"volume").attr({
fill:"#FF7F00","text-anchor":"middle","font-size":8}
);
var o=x.line(g/2-5,F(0),g/2+5,F(0)).attr({
stroke:"#FF7F00"}
);
var s=x.line(0,t.y,g,t.y).attr({
stroke:"#FF7F00"}
).addClass("gainLine");
s.drag(oe(s),Q,se(s));
for(var c=0;
c<e.length;
c++){
var u=e[c];
var l=u.x;
var f=u.y;
var v=n;
if(u.t=="peaking"){
v={
fill:w,stroke:w}
}
if(u.t=="highshelf"||u.t=="lowshelf"){
v={
fill:b,stroke:b}
}
  var dotColor=v.fill||v.stroke||m;
  var d=I.path(_circleDotPath).attr({
    fill:"none",
    stroke:dotColor,
    strokeWidth:2,
    transform:"translate("+l+","+f+") scale("+_dotScale+") translate(-12,-12)"
  }).addClass("filterDot");
  d.data("origColor",dotColor);
  d.drag(ce(u,c,I),Q,he(u,c));
  d.dblclick(ee(u,c))}
}
function ee(e,t){
return function(){
e.gain=0;
e.y=F(0);
de(t);
n()}
}
function l(e){
return L(e/T)*c}
function P(e){
return te(e/c)*T}
function te(e){
return Math.pow(e,1/4)}
function L(e){
return Math.pow(e,4)}
function F(e){
var t=u-k;
return B*(1-(e-k)/t)}
function f(e){
var t=u-k;
return(1-e/B)*t+k}
function ne(e,t,n){
if(e<t){
return t}
if(e>n){
return n}
return e}
function v(e){
var t=e.node.getClientRects()[0];
return[t.left,t.top,t.width,t.height]}
var R={
}
;
function d(e,t,n){
var r=t.frequency;
var a=t.q;
var i=t.gain;
var o=Math.tan(Math.PI*r/E);
var s=1/(1+1/a*o+o*o);
var c=Math.pow(10,Math.abs(i)/20);
var u=0;
var l=0;
var f=0;
var v=0;
var d=0;
var h="#FF7F00";
if(t.t=="peaking"){
h=w;
if(i>=0){
s=1/(1+1/a*o+o*o);
u=(1+c/a*o+o*o)*s;
l=2*(o*o-1)*s;
f=(1-c/a*o+o*o)*s;
v=l;
d=(1-1/a*o+o*o)*s}
else{
s=1/(1+c/a*o+o*o);
u=(1+1/a*o+o*o)*s;
l=2*(o*o-1)*s;
f=(1-1/a*o+o*o)*s;
v=l;
d=(1-c/a*o+o*o)*s}
}
else if(t.t=="highshelf"){
h=b;
if(i>=0){
s=1/(1+Math.SQRT2*o+o*o);
u=(c+Math.sqrt(2*c)*o+o*o)*s;
l=2*(o*o-c)*s;
f=(c-Math.sqrt(2*c)*o+o*o)*s;
v=2*(o*o-1)*s;
d=(1-Math.SQRT2*o+o*o)*s}
else{
s=1/(c+Math.sqrt(2*c)*o+o*o);
u=(1+Math.SQRT2*o+o*o)*s;
l=2*(o*o-1)*s;
f=(1-Math.SQRT2*o+o*o)*s;
v=2*(o*o-c)*s;
d=(c-Math.sqrt(2*c)*o+o*o)*s}
}
else if(t.t=="lowshelf"){
h=b;
if(i>=0){
s=1/(1+Math.SQRT2*o+o*o);
u=(1+Math.sqrt(2*c)*o+c*o*o)*s;
l=2*(c*o*o-1)*s;
f=(1-Math.sqrt(2*c)*o+c*o*o)*s;
v=2*(o*o-1)*s;
d=(1-Math.SQRT2*o+o*o)*s}
else{
s=1/(1+Math.sqrt(2*c)*o+c*o*o);
u=(1+Math.SQRT2*o+o*o)*s;
l=2*(o*o-1)*s;
f=(1-Math.SQRT2*o+o*o)*s;
v=2*(c*o*o-1)*s;
d=(1-Math.sqrt(2*c)*o+c*o*o)*s}
}
var m=[];
for(var g=0;
g<T;
g+=2){
var p=L(g/T)*Math.PI;
var y=Math.pow(Math.sin(p/2),2);
var M=Math.log((Math.pow(u+l+f,2)-4*(u*l+4*u*f+l*f)*y+16*u*f*y*y)/(Math.pow(1+v+d,2)-4*(v+4*d+v*d)*y+16*d*y*y));
M=M*10/Math.LN10;
M=F(M);
if(M==-Infinity){
M=B-1}
if(Math.abs(M-B/2)>1){
m=m.concat([g,M])}
}
var k=null;
if(i>=0){
k=e.gradient("l(.5, 0, .5, 1)"+h+"-"+q)}
else{
k=e.gradient("l(.5, 1, .5, 0)"+h+"-"+q)}
if(R[n]){
R[n].remove()}
R[n]=e.polyline(m).attr({
stroke:k,"fill-opacity":"0","pointer-events":"none"}
)}
function re(e,t){
var n=[];
for(var r=0;
r<t.length;
r++){
var a=t[r];
d(e,a,r)}
}
function ae(e){
for(var t=5;
t<c;
t*=2){
var n=P(t);
e.line(n,B/2+10,n,B/2-10).attr({
stroke:"#FF7F00","stroke-opacity":.25}
);
e.line(n,B,n,B-15).attr({
stroke:"#FF7F00"}
);
e.text(n,B-18,""+Math.round(l(n))).attr({
fill:"#FF7F00","text-anchor":"middle","font-size":10}
);
e.line(n,0,n,15).attr({
stroke:"#FF7F00"}
)}
var r=5;
for(var a=k;
a<u;
a+=r){
var i=F(a);
if(Math.abs(u)-Math.abs(a)>r/2){
e.line(0,i,5,i).attr({
stroke:"#FF7F00"}
);
e.text(7,i,""+a).attr({
fill:"#FF7F00","font-size":10,"dominant-baseline":"middle"}
)}
}
}
function ie(e){
if(e<.2){
e=.2}
if(e>11){
e=11}
return e}
function oe(o){
return function(e,t,n,r,a){
var i=v(x);
var sy=B/i[3];
r=(r-i[1])*sy;
if(r<0||r>=B){return}
if(f(r)>M){r=F(M)}
o.y=r;
o.gain=le(f(r));
this.attr({y1:r, y2:r});
ve(o)}
}
function se(e){
return function(){
this.attr({
fill:q}
);
chrome.runtime.sendMessage({
type:"gainUpdated",gain:e.gain}
);
n()}
}
function ce(o,s,c){
return function(e,t,n,r,a){
if(a.shiftKey){
o.q=ie(o.q+a.movementY/10)}
else{
var i=v(I);
var sx=T/i[2];
var sy=B/i[3];
n=(n-i[0])*sx;
r=(r-i[1])*sy;
if(n<0||n>=T||r<0||r>=B){return}
o.x=n;
o.y=r;
o.gain=f(r);
o.frequency=l(n);
this.attr({
transform:"translate("+n+","+r+") scale("+_dotScale+") translate(-12,-12)"
})}
d(c,o,s);
ue(o,s)}
}
function ue(e,t){
chrome.runtime.sendMessage({
type:"modifyFilter",index:t,frequency:l(e.x),gain:f(e.y),q:e.q}
)}
function le(e){
return Math.pow(10,e/10)}
function fe(e){
return 10*Math.log10(e)}
function ve(e){
chrome.runtime.sendMessage({
type:"modifyGain",gain:e.gain}
)}
function de(e){
chrome.runtime.sendMessage({
type:"resetFilter",index:e}
)}
var Q=function(){
this.data("origTransform",this.transform().local);
var oc=this.data("origColor");
if(oc){
this.attr({d:_circleDotFilledPath,fill:oc,stroke:"none"})
} else {
this.attr({fill:"black"})
}
};
function he(e,t){
return function(){
var oc=this.data("origColor");
if(oc){
this.attr({d:_circleDotPath,fill:"none",stroke:oc,strokeWidth:2})
} else {
this.attr({fill:q})
}
chrome.runtime.sendMessage({
type:"filterUpdated",filterType:e.t,frequency:e.frequency,gain:e.gain,q:e.q}
);
n()}
}
if(y()){
h()}
}
(function(){
scope()}
)();

