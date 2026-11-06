#!/usr/bin/env python3
"""
Automated Discloud deployer with retry on NO_CLUSTER error.
If the Discloud free tier cluster is full, this script waits and automatically
retries every 25 seconds until a free slot opens.
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
from pack_discloud import package, OUTPUT_ZIP

DISCLOUD_API_URL = "https://api.discloud.app/v2/upload"

def deploy(discloud_token: str, max_retries: int = 15, delay_seconds: int = 25) -> bool:
    if not os.path.exists(OUTPUT_ZIP):
        package()

    with open(OUTPUT_ZIP, "rb") as f:
        file_bytes = f.read()

    boundary = "----DiscloudBoundary" + str(int(time.time()))
    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f'Content-Disposition: form-data; name="file"; filename="{OUTPUT_ZIP}"\r\n'.encode("utf-8"))
    body.extend(b"Content-Type: application/zip\r\n\r\n")
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

    headers = {
        "api-token": discloud_token,
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "User-Agent": "DiscloudAutoDeployer/1.0",
    }

    print("🚀 Iniciando envio para a Discloud...")

    for attempt in range(1, max_retries + 1):
        print(f"Tentativa {attempt}/{max_retries}...")
        req = urllib.request.Request(DISCLOUD_API_URL, data=bytes(body), headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                if res_data.get("status") == "ok":
                    print("🎉 SUCESSO! Aplicação enviada e iniciada na Discloud!")
                    print(json.dumps(res_data, indent=2))
                    return True
                else:
                    print(f"Resposta inesperada: {res_data}")
        except urllib.error.HTTPError as e:
            err_text = e.read().decode("utf-8", errors="replace")
            try:
                err_json = json.loads(err_text)
                code = err_json.get("code")
                msg = err_json.get("message", "")

                if code == "NO_CLUSTER" or "alta demanda" in msg:
                    print(f"⏳ Cluster gratuito lotado ({code}). Aguardando {delay_seconds}s para tentar novamente assim que uma vaga abrir...")
                    time.sleep(delay_seconds)
                    continue
                else:
                    print(f"❌ Erro da API Discloud ({e.code}): {msg}")
                    return False
            except Exception:
                print(f"❌ Erro HTTP {e.code}: {err_text}")
                return False
        except Exception as e:
            print(f"⚠️ Erro de conexão: {e}. Aguardando {delay_seconds}s...")
            time.sleep(delay_seconds)

    print("❌ Número máximo de tentativas atingido. Tente novamente em alguns minutos ou utilize outra plataforma.")
    return False

if __name__ == "__main__":
    token = os.getenv("DISCLOUD_TOKEN", "").strip()
    if len(sys.argv) > 1:
        token = sys.argv[1].strip()

    if not token:
        print("💡 Uso: python3 deploy_discloud.py <SEU_DISCLOUD_API_TOKEN>")
        print("   Ou defina a variável DISCLOUD_TOKEN no ambiente.")
        print("\nPara empacotar manualmente sem token, use: python3 pack_discloud.py")
        sys.exit(1)

    deploy(token)
