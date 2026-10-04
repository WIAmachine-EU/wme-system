import sys
import os

# add backend path to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models import DealerCompany, CustomUser, Order

dealers_data = [
    {"name": "WME", "country": "WIA", "sap_code": "1111111"},
    {"name": "AK MAKINA", "country": "Turkey", "sap_code": "6001019"},
    {"name": "ARO-TEC", "country": "Germany", "sap_code": "6001275"},
    {"name": "ATON", "country": "Bulgaria", "sap_code": "6001216"},
    {"name": "BREMBO", "country": "Poland", "sap_code": None},
    {"name": "CNC MECHANICS", "country": "Greece", "sap_code": "6001256"},
    {"name": "CNC RESITVE", "country": "Slovenia", "sap_code": "6001027"},
    {"name": "DEMTEK", "country": "Serbia", "sap_code": "6001382"},
    {"name": "FEDAROM", "country": "Romania", "sap_code": "6001026"},
    {"name": "GMP", "country": "Spain", "sap_code": "6001438"},
    {"name": "LICHRON", "country": "Sweden", "sap_code": "6001010"},
    {"name": "M+E", "country": "Hungary", "sap_code": "6001444"},
    {"name": "MACHINEMATCH", "country": "Netherlands", "sap_code": "6001456"},
    {"name": "MACHINERY", "country": "Finland", "sap_code": None},
    {"name": "MTI", "country": "Poland", "sap_code": "6001022"},
    {"name": "MUGGLER", "country": "Denmark", "sap_code": "6001018"},
    {"name": "NAGEL", "country": "Germany", "sap_code": "6001002"},
    {"name": "NEWEMAG", "country": "Switzerland", "sap_code": "6001009"},
    {"name": "PA BACHKE", "country": "Norway", "sap_code": "6001477"},
    {"name": "PLANCHE", "country": "Finland", "sap_code": "6001008"},
    {"name": "PROFIKA", "country": "Czech & Slovakia", "sap_code": "6001021"},
    {"name": "REPMO", "country": "France", "sap_code": "6001447"},
    {"name": "TECNIMPOR", "country": "Portugal", "sap_code": "6001476"},
    {"name": "TW WARD", "country": "United Kingdom", "sap_code": "6001012"},
    {"name": "VENTEN", "country": "Estonia", "sap_code": "6001351"},
    {"name": "VIMACCHINE", "country": "Italy", "sap_code": "6001006"},
    {"name": "WECO", "country": "Germany", "sap_code": "6001437"}
]

dealers_to_delete = [
    "TechMachinery GmbH",
    "Alpha Precision S.R.L.",
    "Nordic Tooling AB",
    "EuroLathe Polska Sp. z o.o.",
    "Iberia CNC Solutions"
]

def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # 1. Delete old dealers and their associated users and orders to avoid foreign key constraint errors
    print("Deleting old seed dealers...")
    for d_name in dealers_to_delete:
        dealer = db.query(DealerCompany).filter(DealerCompany.name == d_name).first()
        if dealer:
            # Delete associated users
            users = db.query(CustomUser).filter(CustomUser.dealer_company_id == dealer.id).all()
            for u in users:
                db.delete(u)
            
            # Delete associated orders
            orders = db.query(Order).filter(Order.dealer_company_id == dealer.id).all()
            for o in orders:
                db.delete(o)
                
            # Now delete the dealer
            db.delete(dealer)
            print(f"Deleted: {d_name}")
            
    db.commit()
    
    # 2. Add or update new dealers
    print("Inserting/Updating actual dealers...")
    added_count = 0
    updated_count = 0
    
    for d in dealers_data:
        existing = db.query(DealerCompany).filter(DealerCompany.name == d["name"]).first()
        if not existing:
            new_dealer = DealerCompany(
                name=d["name"],
                country=d["country"],
                region="Europe", # Default region
                sap_code=d.get("sap_code")
            )
            db.add(new_dealer)
            added_count += 1
        else:
            existing.country = d["country"]
            existing.sap_code = d.get("sap_code")
            updated_count += 1
            
    db.commit()
    print(f"Dealer update completed. Added: {added_count}, Updated: {updated_count}")
    
    db.close()

if __name__ == "__main__":
    main()
