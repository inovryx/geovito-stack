# Idempotency Rules v1

## Amaç
Ayni payload tekrar calistiginda core veri bozulmamali ve tekrarli mutasyon olusmamalidir.

## Kurallar
- Her batch benzersiz `idempotency_key` tasir.
- Her kayit `record_id` + `payload_hash` ile degerlendirilir.
- Ayni hash tekrar geldiginde no-op davranisi tercih edilir.
- Degisen hash varsa sadece `safe-update-fields` uygulanir.
- Basarisiz yarim batch sonrasi tekrar calisma guvenli olmalidir.

## Audit
- Batch bazli sonuc:
  - inserted
  - updated
  - unchanged
  - failed
- Tum sonuclar operasyon raporuna yazilir.
