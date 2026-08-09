update public.categories
set image_url = '/images/uniforms/catalog/normal-remera.webp'
where slug = 'uniformes-escolares'
  and image_url like 'https://images.unsplash.com/%';
