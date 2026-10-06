import { defineConfig } from 'vite';

// Servidor de desarrollo y compilación del cliente. La raíz es este paquete (index.html); la salida va a dist/.
export default defineConfig({
  build: {
    target: 'es2024',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
