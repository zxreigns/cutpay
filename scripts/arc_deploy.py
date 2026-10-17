#!/usr/bin/env python3
"""CutPay Arc deploy/ops tool (plain JSON-RPC, no Foundry needed).
The deployer key is read from env DEPLOYER_KEY (or TAB_VAULT) and is never printed.
usage: arc_deploy.py deploy <artifact.json> | balance | call <addr> <fn> args... | send <addr> <fn> args... | approve <spender> <amount6> | fund <to> <amount6>
"""
import json, os, sys, time, requests
from eth_account import Account
from eth_abi import encode, decode
from eth_utils import keccak, to_checksum_address
RPC=os.environ.get("ARC_RPC","https://rpc.mainnet.arc.io"); CHAIN=int(os.environ.get("ARC_CHAIN","5042"))
USDC="0x3600000000000000000000000000000000000000"
def rpc(m,p):
    r=requests.post(RPC,json={"jsonrpc":"2.0","id":1,"method":m,"params":p},timeout=40).json()
    if 'error' in r: raise SystemExit("RPC error: "+json.dumps(r['error']))
    return r['result']
def load_acct():
    key=os.environ.get("DEPLOYER_KEY") or os.environ.get("TAB_VAULT") or ""
    if key.startswith('"'): key=json.loads(key)
    if not key: raise SystemExit("no key in env")
    a=Account.from_key(key); return a
def sel(sig): return keccak(text=sig)[:4]
def fn_by_name(abi,name):
    return [f for f in abi if f.get('type')=='function' and f['name']==name][0]
def enc_call(abi,name,args):
    f=fn_by_name(abi,name); types=[i['type'] if i['type']!='tuple' else None for i in f['inputs']]
    sig=name+"("+",".join(i['type'] for i in f['inputs'])+")"
    conv=[]
    for i,a in zip(f['inputs'],args):
        t=i['type']
        if t=='uint256[]': conv.append([int(x) for x in (json.loads(a) if isinstance(a,str) else a)])
        elif t.startswith('uint'): conv.append(int(a))
        elif t=='address': conv.append(to_checksum_address(a))
        elif t=='bytes32': conv.append(bytes.fromhex(a[2:]) if isinstance(a,str) else a)
        else: conv.append(a)
    return sel(sig)+encode([i['type'] for i in f['inputs']],conv), f
def send_raw(acct,to,data,gas=None,value=0):
    me=acct.address
    if to: to=to_checksum_address(to)
    nonce=int(rpc("eth_getTransactionCount",[me,"pending"]),16)
    tx0={"from":me,"data":"0x"+data.hex(),"value":hex(value)}
    if to: tx0["to"]=to
    est=int(rpc("eth_estimateGas",[tx0]),16) if gas is None else gas
    base=int(rpc("eth_gasPrice",[]),16); maxfee=max(int(base*1.5), 25_000_000_000)
    tx={"chainId":CHAIN,"nonce":nonce,"value":value,"data":data,"gas":int(est*1.2)+10000,"maxFeePerGas":maxfee,"maxPriorityFeePerGas":min(maxfee,1_000_000_000),"type":2}
    if to: tx["to"]=to
    s=acct.sign_transaction(tx); raw=getattr(s,'raw_transaction',None) or s.rawTransaction
    h=rpc("eth_sendRawTransaction",["0x"+raw.hex() if not raw.hex().startswith('0x') else raw.hex()])
    for i in range(90):
        time.sleep(1); r=rpc("eth_getTransactionReceipt",[h])
        if r: return h,r
    raise SystemExit("no receipt "+h)
def main():
    cmd=sys.argv[1]
    if cmd=="balance":
        a=sys.argv[2]; print(json.dumps({"addr":a,"usdc":int(rpc("eth_getBalance",[a,"latest"]),16)/1e18})); return
    acct=load_acct()
    if cmd=="deploy":
        art=json.load(open(sys.argv[2])); code=bytes.fromhex(art['bytecode']['object'][2:])
        data=code+encode(['address'],[to_checksum_address(USDC)])
        h,r=send_raw(acct,None,data)
        print(json.dumps({"tx":h,"contract":r.get("contractAddress"),"status":r.get("status"),"gasUsed":int(r["gasUsed"],16),"effectiveGasPrice":int(r.get("effectiveGasPrice","0x0"),16)}))
    elif cmd=="approve":
        spender,amt=sys.argv[2],int(sys.argv[3]); data=sel("approve(address,uint256)")+encode(['address','uint256'],[to_checksum_address(spender),amt])
        h,r=send_raw(acct,USDC,data); print(json.dumps({"tx":h,"status":r["status"],"gasUsed":int(r["gasUsed"],16)}))
    elif cmd=="fund":
        to,amt18=sys.argv[2],int(sys.argv[3]); h,r=send_raw(acct,to,b"",gas=21000,value=amt18); print(json.dumps({"tx":h,"status":r["status"]}))
    elif cmd in ("send","call"):
        art=json.load(open(os.environ["CUTPAY_ABI"])); abi=art['abi'] if 'abi' in art else art
        addr,name=sys.argv[2],sys.argv[3]; data,f=enc_call(abi,name,sys.argv[4:])
        if cmd=="call":
            out=rpc("eth_call",[{"to":addr,"data":"0x"+data.hex()},"latest"])
            types=[o['type'] for o in f['outputs']]
            try: print(json.dumps(decode(types,bytes.fromhex(out[2:])),default=str))
            except Exception as e: print(out)
        else:
            h,r=send_raw(acct,addr,data); print(json.dumps({"tx":h,"status":r["status"],"gasUsed":int(r["gasUsed"],16),"logs":len(r.get("logs",[]))}))
    print("", file=sys.stderr)
if __name__=="__main__": main()
