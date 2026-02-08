# Import Adapter Boundary

Bu klasor, gelecekteki `Atlas Import Project` tarafinda yazilacak adapter kodlari icin ayrildi.

Bu repoda aktif import execution yoktur.
Adapter sorumlulugu:
- Contract payload dogrulama
- Idempotency key kontrolu
- Strapi'ye upsert uygulama
- Sonuc raporunu `import-batch` tablosuna yazma
