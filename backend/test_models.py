import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    print(f"Using API Key starting with: {api_key[:5]}...")
    try:
        models = [m.name for m in genai.list_models()]
        print("Available models:")
        for m in models:
            if 'gemini' in m.lower():
                print(" -", m)
    except Exception as e:
        print("Error:", e)
else:
    print("No GEMINI_API_KEY found.")
