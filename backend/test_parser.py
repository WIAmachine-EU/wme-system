import os
import sys

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from storage import default_storage
from ai_cargo_parser import process_file_event

def list_and_process():
    if hasattr(default_storage, 's3_client'):
        print("Listing objects in R2...")
        try:
            response = default_storage.s3_client.list_objects_v2(
                Bucket=default_storage.bucket_name,
                Prefix='Einlagerung-TCO/'
            )
            if 'Contents' in response:
                for obj in response['Contents']:
                    key = obj['Key']
                    print(f"Found file: {key}")
                    if key.endswith('.pdf') and 'G1373-0046' in key or 'Einlagerung' in key: # Not sure of filename, just process pdfs
                        print(f"Triggering processing for {key}...")
                        process_file_event(key)
            else:
                print("No objects found with prefix 'Einlagerung-TCO/'")
        except Exception as e:
            print(f"Error: {e}")
    else:
        print("Not using S3 storage")

if __name__ == "__main__":
    list_and_process()
