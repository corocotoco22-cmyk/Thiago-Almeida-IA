export type AssistantMode =
  | 'geral'
  | 'engenharia'
  | 'estrategia'
  | 'escrita'
  | 'didatica';

export type ThinkingDepth = 'rapido' | 'profundo';

export interface ImageAttachment {
  mimeType: string;
  data: string;
  previewUrl: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  mode?: AssistantMode;
  image?: {
    mimeType: string;
    data: string;
    name?: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  mode: AssistantMode;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface StarterPrompt {
  title: string;
  description: string;
  prompt: string;
}

export interface ModeConfig {
  id: AssistantMode;
  label: string;
  shortLabel: string;
  description: string;
  starters: StarterPrompt[];
}

export const THIAGO_AVATAR_URL =
  '/src/assets/images/thiago_almeida_avatar_1795297349363.jpg';

export const MODE_CONFIGS: Record<AssistantMode, ModeConfig> = {
  geral: {
    id: 'geral',
    label: 'Geral',
    shortLabel: 'Geral',
    description: 'Diálogo natural, sínteses claras e apoio para decisões do dia a dia.',
    starters: [
      {
        title: 'Organizar prioridades da semana',
        description: 'Transforme tarefas soltas em um plano realista de execução.',
        prompt:
          'Tenho vários projetos paralelos esta semana e pouco tempo livre. Me ajude a criar um método simples para priorizar o que realmente importa.',
      },
      {
        title: 'Resumir e extrair ações',
        description: 'Estruture ideias complexas em tópicos objetivos e acionáveis.',
        prompt:
          'Quais são as melhores perguntas que devo fazer antes de aprovar um novo projeto na minha equipe?',
      },
      {
        title: 'Comparar opções com clareza',
        description: 'Avalie prós, contras e critérios práticos antes de decidir.',
        prompt:
          'Preciso decidir entre investir em um curso de especialização ou construir um projeto prático para portfólio. Como avaliar os dois caminhos?',
      },
      {
        title: 'Criar uma página HTML moderna',
        description: 'Gere código HTML/CSS limpo, semântico e responsivo.',
        prompt:
          'Crie um exemplo completo de cartão de apresentação pessoal em HTML e CSS semântico, com bom contraste e responsividade.',
      },
    ],
  },
  engenharia: {
    id: 'engenharia',
    label: 'Engenharia',
    shortLabel: 'Engenharia',
    description: 'Arquitetura de software, HTML/CSS, TypeScript, APIs e depuração.',
    starters: [
      {
        title: 'Landing page em HTML puro',
        description: 'Estrutura semântica acessível com CSS Grid e variáveis.',
        prompt:
          'Escreva uma estrutura HTML5 semântica e CSS moderno para uma página institucional minimalista de um estúdio de arquitetura.',
      },
      {
        title: 'Revisar arquitetura de API',
        description: 'Boas práticas de endpoints REST, validação e tratamento de erros.',
        prompt:
          'Quais cuidados essenciais devo ter ao projetar uma API Express com TypeScript para evitar falhas comuns em produção?',
      },
      {
        title: 'Otimizar performance no frontend',
        description: 'Diagnóstico de renderização, carregamento e Core Web Vitals.',
        prompt:
          'Minha aplicação web está demorando para interagir no celular. Liste um roteiro prático de diagnóstico do que verificar primeiro.',
      },
      {
        title: 'Explicar padrão de design',
        description: 'Quando usar composição, hooks ou máquinas de estado.',
        prompt:
          'Explique com um exemplo objetivo em TypeScript quando vale a pena trocar múltiplos useState por um useReducer.',
      },
    ],
  },
  estrategia: {
    id: 'estrategia',
    label: 'Estratégia',
    shortLabel: 'Estratégia',
    description: 'Posicionamento de produto, análise de mercado e decisões executivas.',
    starters: [
      {
        title: 'Validar proposta de valor',
        description: 'Teste hipóteses de negócio antes de escrever código.',
        prompt:
          'Quero lançar um micro-SaaS para pequenas clínicas odontológicas no Brasil. Como validar a dor real dos clientes em 7 dias?',
      },
      {
        title: 'Estruturar precificação',
        description: 'Compare modelos de assinatura, planos e ancoragem de valor.',
        prompt:
          'Quais critérios devo usar para definir o preço inicial de um produto B2B brasileiro sem subvalorizar o serviço?',
      },
      {
        title: 'Preparar reunião decisiva',
        description: 'Roteiro conciso com contexto, opções e recomendação clara.',
        prompt:
          'Me ajude a montar a pauta de uma reunião de 30 minutos para apresentar uma mudança de escopo à diretoria.',
      },
      {
        title: 'Mapear riscos operacionais',
        description: 'Antecipe gargalos antes de escalar um produto digital.',
        prompt:
          'Quais são os 5 principais riscos ocultos ao migrar uma operação manual para um portal digital de autoatendimento?',
      },
    ],
  },
  escrita: {
    id: 'escrita',
    label: 'Escrita',
    shortLabel: 'Escrita',
    description: 'Textos editoriais, e-mails profissionais, roteiros e revisão de tom.',
    starters: [
      {
        title: 'E-mail profissional direto',
        description: 'Comunique um prazo ou recusa com firmeza e elegância.',
        prompt:
          'Escreva um e-mail educado, firme e objetivo recusando uma proposta comercial cujo orçamento está abaixo do necessário.',
      },
      {
        title: 'Artigo de opinião técnico',
        description: 'Transforme um aprendizado prático em texto envolvente.',
        prompt:
          'Crie o esboço de um artigo curto sobre por que interfaces simples vencem produtos cheios de funcionalidades pouco usadas.',
      },
      {
        title: 'Revisar clareza de texto',
        description: 'Elimine repetições e torne a leitura mais fluida.',
        prompt:
          'Quais são os 6 vícios de escrita corporativa em português que mais enfraquecem apresentações e propostas comerciais?',
      },
      {
        title: 'Roteiro de vídeo curto',
        description: 'Gancho inicial forte, desenvolvimento claro e fechamento.',
        prompt:
          'Escreva um roteiro de 60 segundos explicando o que é inteligência artificial generativa para empreendedores locais, sem jargões.',
      },
    ],
  },
  didatica: {
    id: 'didatica',
    label: 'Didática',
    shortLabel: 'Didática',
    description: 'Explicações passo a passo, analogias claras e planos de estudo.',
    starters: [
      {
        title: 'Entender APIs do zero',
        description: 'Analogia concreta + exemplo prático de requisição.',
        prompt:
          'Explique o que é uma API REST e como funciona uma requisição HTTP usando uma analogia clara do cotidiano.',
      },
      {
        title: 'Plano de estudos em HTML e CSS',
        description: 'Trilha progressiva de 4 semanas com projetos reais.',
        prompt:
          'Monte um plano de estudos prático de 4 semanas para alguém aprender HTML5 e CSS moderno criando páginas reais.',
      },
      {
        title: 'Desmistificar assincronismo',
        description: 'Promises e async/await explicados sem complicação.',
        prompt:
          'Explique passo a passo a diferença entre código síncrono, Promises e async/await em JavaScript com exemplos curtos.',
      },
      {
        title: 'Simular entrevista técnica',
        description: 'Pratique respostas estruturadas com feedback imediato.',
        prompt:
          'Faça o papel de entrevistador e me faça a primeira pergunta conceitual de nível pleno sobre desenvolvimento web.',
      },
    ],
  },
};

export const MODE_LIST: ModeConfig[] = [
  MODE_CONFIGS.geral,
  MODE_CONFIGS.engenharia,
  MODE_CONFIGS.estrategia,
  MODE_CONFIGS.escrita,
  MODE_CONFIGS.didatica,
];
