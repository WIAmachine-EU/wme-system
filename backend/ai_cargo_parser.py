import os
import json
import io
import re
from typing import List
from PyPDF2 import PdfReader
from sqlalchemy.orm import Session
import pandas as pd

from database import SessionLocal
import models
from storage import default_storage

try:
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
except Exception:
    client = None

def get_text_from_pdf(file_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text

def parse_with_llm(text: str) -> List[dict]:
    """
    Extracts Cargo Details using LLM.
    Fallback to a mock if API key is not present.
    """
    if client and os.getenv("OPENAI_API_KEY"):
        prompt = f"""
        Extract the cargo details from the following document text.
        The document contains shipping/cargo information (Einlagerungsmeldung).
        We need a JSON array of objects representing each item box.
        Each object MUST have the following keys:
        - "serial_number": The S/N (e.g. G1373-0046)
        - "item": "MACHINE" for main machine, or "CC" for Chip Conveyor
        - "qty": integer (e.g. 1)
        - "box_no": The C/No. (e.g. "1/2" or "2/2")
        - "dimensions": The dimensions (e.g. "590 x 228 x 250 CM")
        - "net_weight": The Net Weight in KG (e.g. "10.500 KG")
        - "gross_weight": The Gross Weight in KG (e.g. "11.000 KG")
        
        Text:
        {text}
        
        Output ONLY a valid JSON array. Do not include markdown code blocks.
        """
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        return json.loads(content)
    
    # --- FALLBACK MOCK FOR DEMO PURPOSES ---
    print("WARNING: Using mock LLM parser since OPENAI_API_KEY is not configured.")
    if "G1373-0046" in text or "L4000LMC" in text:
        return [
            {
                "serial_number": "G1373-0046",
                "item": "MACHINE",
                "qty": 1,
                "box_no": "1/2",
                "dimensions": "590 x 228 x 250 CM",
                "net_weight": "10500",
                "gross_weight": "11000"
            },
            {
                "serial_number": "G1373-0046",
                "item": "CC",
                "qty": 1,
                "box_no": "2/2",
                "dimensions": "550 x 224 x 190 CM",
                "net_weight": "1500",
                "gross_weight": "1800"
            }
        ]
    return []

def process_file_event(file_key: str):
    """
    Downloads the file from R2, parses it, and updates DB.
    """
    print(f"[AI Cargo Parser] Processing file: {file_key}")
    
    file_bytes = default_storage.read_file(file_key)
    if not file_bytes:
        print(f"[AI Cargo Parser] Could not read file: {file_key}")
        return
        
    extracted_data = []
    
    if file_key.lower().endswith('.pdf'):
        text = get_text_from_pdf(file_bytes)
        try:
            extracted_data = parse_with_llm(text)
        except Exception as e:
            print(f"[AI Cargo Parser] LLM extraction failed: {e}")
            return
    elif file_key.lower().endswith('.xlsx') or file_key.lower().endswith('.xls'):
        try:
            df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=0)
            header_idx = -1
            for i, row in df.iterrows():
                if any('호기' in str(val) or 'S/O' in str(val) for val in row.values):
                    header_idx = i
                    break
            
            if header_idx != -1:
                df.columns = df.iloc[header_idx]
                df = df.iloc[header_idx+1:].reset_index(drop=True)
                
                for _, row in df.iterrows():
                    sn = str(row.get('호기', '')).strip()
                    if pd.isna(sn) or not sn or sn == '//':
                        continue
                        
                    item_type = str(row.get('구성품', '')).strip()
                    item_mapped = "MACHINE" if "본기" in item_type or "Machine" in item_type else "CC"
                    
                    extracted_data.append({
                        "serial_number": sn,
                        "item": item_mapped,
                        "qty": 1,
                        "box_no": str(row.get('BOX NO', '')).strip(),
                        "dimensions": str(row.get('DIMENSION', '')).strip(),
                        "net_weight": str(row.get('N*W', '')).strip(),
                        "gross_weight": str(row.get('G*W', '')).strip()
                    })
        except Exception as e:
            print(f"[AI Cargo Parser] Excel extraction failed: {e}")
            return
    else:
        print(f"[AI Cargo Parser] Unsupported file type for AI processing: {file_key}")
        return

    print(f"[AI Cargo Parser] Extracted {len(extracted_data)} items.")
    
    db = SessionLocal()
    try:
        updated_sns = set()
        for data in extracted_data:
            sn = data.get("serial_number")
            if not sn: continue
            
            existing = db.query(models.CargoDetail).filter(
                models.CargoDetail.serial_number == sn,
                models.CargoDetail.item == data.get("item"),
                models.CargoDetail.box_no == data.get("box_no")
            ).first()
            
            if not existing:
                new_cargo = models.CargoDetail(
                    serial_number=sn,
                    item=data.get("item"),
                    qty=data.get("qty", 1),
                    box_no=data.get("box_no"),
                    dimensions=data.get("dimensions"),
                    net_weight=str(data.get("net_weight")),
                    gross_weight=str(data.get("gross_weight"))
                )
                db.add(new_cargo)
            
            updated_sns.add(sn)
            
        for sn in updated_sns:
            orders = db.query(models.Order).filter(models.Order.serial_number == sn).all()
            for order in orders:
                order.current_status = models.OrderStatus.IN_STOCK
                
        db.commit()
        print(f"[AI Cargo Parser] Successfully saved details and updated orders for S/Ns: {updated_sns}")
    except Exception as e:
        db.rollback()
        print(f"[AI Cargo Parser] DB Update error: {e}")
    finally:
        db.close()
