(() => {
  const galleries = document.querySelectorAll('media-gallery[data-vertical-thumbs="true"]');
  galleries.forEach(gallery => {
    if (gallery.dataset.loop === 'true') {
      const viewer = gallery.querySelector('slider-component[id^="GalleryViewer-"]');
      const list   = viewer?.querySelector('ul[id^="Slider-Gallery-"]');
      const prev   = viewer?.querySelector('.slider-button--prev');
      const next   = viewer?.querySelector('.slider-button--next');
      if (!list || !prev || !next) return;

      const slides = () => Array.from(list.querySelectorAll('.slider__slide'));

      next.addEventListener('click', e => {
        if (next.disabled) {
          e.preventDefault();
          slides()[0]?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        }
      });
      prev.addEventListener('click', e => {
        if (prev.disabled) {
          e.preventDefault();
          slides().at(-1)?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        }
      });
    }
  });
})();
