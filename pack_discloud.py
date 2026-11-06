#!/usr/bin/env python3
"""
Helper script to package the Telegram Gemini Bot into a clean, minimal discloud.zip.
Ensures discloud.config, bot.py, and requirements.txt are at the root of the archive
without any unnecessary folders or heavy files.
"""

import os
import zipfile
import sys

FILES_TO_INCLUDE = [
    "bot.py",
    "requirements.txt",
    "discloud.config",
    "LICENSE",
    "README.md",
]

OUTPUT_ZIP = "discloud.zip"

def package() -> None:
    print(f"📦 Criando arquivo {OUTPUT_ZIP} para upload na Discloud...")
    
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename in FILES_TO_INCLUDE:
            if os.path.exists(filename):
                zf.write(filename, arcname=filename)
                print(f"  ✓ Adicionado: {filename}")
            else:
                print(f"  ⚠️ Aviso: {filename} não encontrado.")

    size_kb = os.path.getsize(OUTPUT_ZIP) / 1024
    print(f"\n✅ Arquivo '{OUTPUT_ZIP}' gerado com sucesso ({size_kb:.1f} KB)!")
    print("👉 Envie este arquivo diretamente no painel da Discloud (https://discloud.com/dashboard).")


if __name__ == "__main__":
    package()
