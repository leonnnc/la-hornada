/* =============================================
   LA HORNADA — Productos por defecto (compartido)
   Usado por tienda.js y admin.js
   stock: número de unidades disponibles (0 = sin stock)
   ============================================= */

const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "Empanadas de Carne",
    desc: "Rellenas de carne molida jugosa, cebolla, aceitunas y huevo. Horneadas al punto perfecto.",
    price: 3.50,
    emoji: "🥟",
    img: "img/empanadas-carne.jpg",
    available: true,
    stock: 10
  },
  {
    id: 2,
    name: "Empanadas de Pollo",
    desc: "Con pollo deshilachado, ají amarillo y especias. Una delicia muy peruana.",
    price: 3.50,
    emoji: "🥟",
    img: "img/empanadas-pollo.jpg",
    available: true,
    stock: 8
  },
  {
    id: 3,
    name: "Churros con Chocolate",
    desc: "Crujientes por fuera, suaves por dentro. Acompañados de salsa de chocolate caliente.",
    price: 5.00,
    emoji: "🍩",
    img: "img/churros.jpg",
    available: true,
    stock: 0
  },
  {
    id: 4,
    name: "Pie de Manzana",
    desc: "Masa hojaldrada artesanal con relleno de manzana caramelizada y canela. Porción generosa.",
    price: 8.00,
    emoji: "🥧",
    img: "img/pie-manzana.jpg",
    available: true,
    stock: 5
  },
  {
    id: 5,
    name: "Leche Asada",
    desc: "Postre cremoso y suave horneado a baño María. Sabor tradicional irresistible.",
    price: 6.50,
    emoji: "🍮",
    img: "img/leche-asada.jpg",
    available: true,
    stock: 0
  },
  {
    id: 6,
    name: "Orejas con Dulce",
    desc: "Hojaldradas, caramelizadas y con azúcar glas. Perfectas con un buen café.",
    price: 2.50,
    emoji: "🌀",
    img: "img/orejas.jpg",
    available: true,
    stock: 15
  },
  {
    id: 7,
    name: "Alfajores",
    desc: "Galletas suaves rellenas de manjar blanco y bañadas en azúcar en polvo. Clasicazos.",
    price: 3.00,
    emoji: "🍪",
    img: "img/alfajores.jpg",
    available: true,
    stock: 12
  },
  {
    id: 8,
    name: "Torta de Chocolate",
    desc: "Húmeda, esponjosa y con cobertura de ganache. Porción individual deliciosa.",
    price: 9.00,
    emoji: "🎂",
    img: "img/torta-chocolate.jpg",
    available: true,
    stock: 3
  }
];
