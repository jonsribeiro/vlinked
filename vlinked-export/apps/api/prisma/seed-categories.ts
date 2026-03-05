import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const serviceCategories = [
  {
    name: 'Fotografia',
    slug: 'photography',
    description: 'Fotógrafos profissionais para eventos, retratos, produtos e mais',
    icon: '📸',
    color: '#E91E63',
  },
  {
    name: 'Carpintaria',
    slug: 'carpentry',
    description: 'Marceneiros e carpinteiros para móveis e reformas',
    icon: '🪚',
    color: '#795548',
  },
  {
    name: 'Elétrica',
    slug: 'electrical',
    description: 'Eletricistas para instalações e reparos',
    icon: '⚡',
    color: '#FFC107',
  },
  {
    name: 'Construção',
    slug: 'construction',
    description: 'Pedreiros, mestres de obra e serviços de construção',
    icon: '🏗️',
    color: '#607D8B',
  },
  {
    name: 'Beleza',
    slug: 'beauty',
    description: 'Cabeleireiros, maquiadores, manicures e esteticistas',
    icon: '💅',
    color: '#E91E63',
  },
  {
    name: 'Fitness',
    slug: 'fitness',
    description: 'Personal trainers, instrutores de yoga e nutricionistas',
    icon: '💪',
    color: '#4CAF50',
  },
  {
    name: 'DJ',
    slug: 'dj',
    description: 'DJs para festas, eventos e casamentos',
    icon: '🎧',
    color: '#9C27B0',
  },
  {
    name: 'Encanamento',
    slug: 'plumbing',
    description: 'Encanadores para reparos e instalações hidráulicas',
    icon: '🚿',
    color: '#2196F3',
  },
  {
    name: 'Limpeza',
    slug: 'cleaning',
    description: 'Serviços de limpeza residencial e comercial',
    icon: '🧹',
    color: '#00BCD4',
  },
  {
    name: 'Design',
    slug: 'design',
    description: 'Designers gráficos, UX/UI e identidade visual',
    icon: '🎨',
    color: '#FF5722',
  },
  {
    name: 'Programação',
    slug: 'programming',
    description: 'Desenvolvedores e programadores',
    icon: '💻',
    color: '#3F51B5',
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    description: 'Especialistas em marketing digital e redes sociais',
    icon: '📈',
    color: '#009688',
  },
  {
    name: 'Consultoria',
    slug: 'consulting',
    description: 'Consultores de negócios, carreira e especialistas',
    icon: '📊',
    color: '#673AB7',
  },
  {
    name: 'Jardinagem',
    slug: 'gardening',
    description: 'Jardineiros e paisagistas',
    icon: '🌱',
    color: '#8BC34A',
  },
  {
    name: 'Pintura',
    slug: 'painting',
    description: 'Pintores para residências e comerciais',
    icon: '🎨',
    color: '#FF9800',
  },
  {
    name: 'Mecânica',
    slug: 'mechanics',
    description: 'Mecânicos e serviços automotivos',
    icon: '🔧',
    color: '#424242',
  },
  {
    name: 'Culinária',
    slug: 'culinary',
    description: 'Chefs, cozinheiros e buffet',
    icon: '👨‍🍳',
    color: '#F44336',
  },
  {
    name: 'Música',
    slug: 'music',
    description: 'Músicos, professores de música e bandas',
    icon: '🎵',
    color: '#9C27B0',
  },
  {
    name: 'Massagem',
    slug: 'massage',
    description: 'Massoterapeutas e fisioterapeutas',
    icon: '💆',
    color: '#009688',
  },
  {
    name: 'Reformas',
    slug: 'renovation',
    description: 'Reformas em geral e pequenos reparos',
    icon: '🔨',
    color: '#795548',
  },
];

async function main() {
  console.log('Seeding service categories...');

  for (const category of serviceCategories) {
    await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
    console.log(`Category: ${category.name}`);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
