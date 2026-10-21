// SIG-1057: Privacy Policy text (LGPD, Lei 13.709/2018).
// Every statement here must stay accurate to what the code does; update together with the code.
import { LEGAL_COMPANY as P, type LegalText } from "./config";

export const PRIVACY_PT: LegalText = {
  lang: "pt-BR",
  title: "Política de Privacidade",
  updated: `Última atualização: ${P.date}`,
  intro: [
    "Esta Política explica como o Xadrez Digital (o “Serviço”) trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 – LGPD). Escrevemos em linguagem simples e descrevemos apenas o que o Serviço realmente faz.",
    "Você pode usar a análise de partidas como visitante, sem criar conta. Neste caso, seus dados ficam apenas no seu dispositivo (veja a seção “Cookies e armazenamento no dispositivo”).",
  ],
  sections: [
    {
      id: "controlador",
      title: "1. Controlador e contato",
      paragraphs: [
        `O controlador dos dados pessoais é ${P.company}, que utiliza o nome fantasia ${P.tradeName}, inscrita no CNPJ sob o nº ${P.cnpj}, com sede em ${P.address}.`,
        `Para dúvidas, solicitações sobre seus dados ou contato com o encarregado pelo tratamento de dados (DPO): ${P.contact}.`,
      ],
    },
    {
      id: "dados",
      title: "2. Dados que coletamos",
      paragraphs: ["Coletamos apenas os dados necessários para oferecer o Serviço:"],
      items: [
        "Dados de conta: e-mail e senha (armazenada somente como hash pelo provedor de autenticação, nunca em texto puro). Se você entrar com o Google, recebemos do Google os dados básicos do perfil autorizados por você, como e-mail e identificador da conta; não recebemos sua senha do Google.",
        "Perfil e permissões: um registro por usuário com o identificador da conta, o e-mail e o papel (aluno ou administrador).",
        "Conteúdo que você cria: tabuleiros e análises, partidas e arquivos PGN importados, bases de partidas e pastas, anotações, e jogadores marcados como favoritos (nome de usuário e site de origem).",
        "Progresso e preferências: progresso em cursos, exercícios e repertórios; configurações do Serviço (tema, peças, profundidade do motor, layout e idioma do site).",
        "Dados técnicos: endereço IP e cabeçalhos da requisição, tratados pela infraestrutura de hospedagem e usados no limite de tentativas de login (rate limiting) e nos registros (logs) de operação e segurança. Não usamos o IP para criar perfil de comportamento.",
        "Termos pesquisados: quando você busca um jogador ou consulta aberturas, o nome de usuário buscado ou a posição consultada é enviado pelo nosso servidor a serviços de terceiros (veja a seção 5). Não enviamos seu e-mail ou identificador de conta a eles.",
      ],
      after: [
        "Não coletamos dados pessoais sensíveis (art. 5º, II, da LGPD) de forma intencional. Evite incluir dados sensíveis em anotações ou arquivos que você salvar na sua conta.",
      ],
    },
    {
      id: "finalidades",
      title: "3. Finalidades e bases legais (LGPD, art. 7º)",
      items: [
        "Criar e manter sua conta, autenticar você e sincronizar seu conteúdo entre dispositivos. Base legal: execução de contrato ou de procedimentos preliminares a pedido do titular (art. 7º, V).",
        "Salvar suas preferências, seu progresso e seu idioma. Base legal: execução de contrato (art. 7º, V).",
        "Enviar e-mails transacionais de autenticação (confirmação de cadastro e redefinição de senha). Base legal: execução de contrato (art. 7º, V).",
        "Proteger o Serviço contra abuso e tentativas de acesso indevido, incluindo limite de tentativas de login por IP e por e-mail. Base legal: legítimo interesse (art. 7º, IX).",
        "Cumprir obrigações legais ou regulatórias e exercer direitos em processos. Base legal: art. 7º, II e VI.",
        "Cursos publicados por autores: o progresso de aula do aluno é tratado para exibir seu andamento (execução de contrato).",
      ],
      after: ["Se no futuro usarmos seus dados para outra finalidade, atualizaremos esta Política e, quando necessário, pediremos seu consentimento (art. 7º, I)."],
    },
    {
      id: "compartilhamento",
      title: "4. Com quem compartilhamos (operadores e terceiros)",
      paragraphs: ["Não vendemos seus dados pessoais. Usamos prestadores que tratam dados em nosso nome ou que você aciona ao usar o Serviço:"],
      items: [
        "Supabase: banco de dados e autenticação (armazena sua conta e o conteúdo salvo na conta).",
        "Cloudflare: hospedagem e rede de entrega (Workers/CDN), armazenamento de arquivos do motor de análise (R2) e limite de requisições. Recebe seu IP ao processar o tráfego.",
        "Google: somente se você escolher “Continuar com o Google”; o login é feito na página do Google, sujeita à política de privacidade do Google.",
        "Lichess, Chess.com e FIDE: consultados pelo nosso servidor para busca de jogadores, partidas e abertura (explorador). Recebem apenas o termo pesquisado (por exemplo, um nome de usuário) ou a posição consultada, além do IP do nosso servidor.",
        "Vídeos de aulas incorporados (YouTube em modo de privacidade aprimorada e Vimeo) e imagens das peças do tabuleiro (cdn.jsdelivr.net): quando você abre uma aula com vídeo ou exporta o tabuleiro, seu navegador se conecta diretamente a esses serviços, que recebem seu IP.",
      ],
      after: [
        "Também podemos compartilhar dados por determinação legal ou de autoridade competente, ou, de forma agregada e sem identificar você, para fins estatísticos.",
        "Não usamos cookies ou ferramentas de publicidade, de análise de audiência ou de rastreamento de terceiros.",
      ],
    },
    {
      id: "transferencia",
      title: "5. Transferência internacional (LGPD, art. 33)",
      paragraphs: [
        "Nossos prestadores (por exemplo Supabase, Cloudflare e Google) podem tratar dados em servidores fora do Brasil. Nesses casos, a transferência ocorre com base nas hipóteses do art. 33 da LGPD, como a execução de contrato e cláusulas contratuais com os prestadores. Mais detalhes podem ser solicitados pelo contato indicado na seção 1.",
      ],
    },
    {
      id: "retencao",
      title: "6. Por quanto tempo guardamos os dados",
      paragraphs: [
        "Mantemos os dados da conta e o conteúdo salvo enquanto a conta existir. Ao excluir a conta, o conteúdo associado (tabuleiros, partidas, pastas, favoritos, progresso e configurações) é apagado do banco de dados, salvo o que precisarmos guardar para cumprir obrigação legal ou defender direitos. Cursos que você tenha publicado como autor podem continuar disponíveis aos alunos, sem vínculo com a sua conta. Registros técnicos (logs) são mantidos pelo período necessário à segurança e operação, conforme as configurações dos prestadores de infraestrutura.",
      ],
    },
    {
      id: "seguranca",
      title: "7. Segurança",
      paragraphs: [
        "Adotamos medidas técnicas e organizacionais razoáveis: conexão criptografada (HTTPS), senhas armazenadas apenas como hash, controle de acesso por linha no banco de dados para que cada usuário acesse somente os próprios dados, cabeçalhos de segurança, política de segurança de conteúdo e limite de tentativas de login. Nenhum sistema é totalmente seguro; em caso de incidente que possa causar risco ou dano relevante, comunicaremos você e a Autoridade Nacional de Proteção de Dados (ANPD) conforme a LGPD.",
      ],
    },
    {
      id: "direitos",
      title: "8. Seus direitos (LGPD, art. 18)",
      paragraphs: ["Você pode, a qualquer momento e mediante requisição:"],
      items: [
        "confirmar a existência de tratamento e acessar seus dados;",
        "corrigir dados incompletos, inexatos ou desatualizados;",
        "solicitar anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;",
        "solicitar a portabilidade dos dados;",
        "solicitar a eliminação dos dados tratados com base em consentimento;",
        "obter informação sobre com quem compartilhamos seus dados;",
        "ser informado sobre a possibilidade de não consentir e suas consequências, e revogar o consentimento;",
        "peticionar à ANPD.",
      ],
      after: [
        `Para exercer seus direitos, incluindo a exclusão da conta e dos dados associados, envie uma mensagem para ${P.contact} a partir do e-mail cadastrado. Podemos pedir informações para confirmar sua identidade. Responderemos no prazo previsto em lei.`,
      ],
    },
    {
      id: "cookies",
      title: "9. Cookies e armazenamento no dispositivo",
      paragraphs: ["O Serviço usa apenas armazenamento essencial ao funcionamento:"],
      items: [
        "Cookies de sessão de autenticação (Supabase), necessários para mantê-lo conectado.",
        "localStorage do navegador: configurações (incluindo idioma do site), layout dos painéis, arquivos e partidas do modo visitante, favoritos e cache de progresso de cursos e repertórios.",
        "IndexedDB do navegador: cache local das revisões de partidas.",
      ],
      after: [
        "Esses dados ficam no seu dispositivo e podem ser apagados nas configurações do navegador (isso pode remover seus dados de visitante). Não usamos cookies de publicidade nem de análise.",
      ],
    },
    {
      id: "criancas",
      title: "10. Crianças e adolescentes (LGPD, art. 14)",
      paragraphs: [
        "O tratamento de dados de crianças e adolescentes deve ser feito em seu melhor interesse. Menores de 18 anos devem usar o Serviço com ciência e autorização de um responsável legal; para crianças (até 12 anos incompletos), o cadastro depende de consentimento específico e em destaque de ao menos um dos pais ou responsável. Se você é responsável e acredita que um menor se cadastrou sem autorização, entre em contato para que possamos excluir os dados.",
      ],
    },
    {
      id: "alteracoes",
      title: "11. Alterações desta Política",
      paragraphs: [
        "Podemos atualizar esta Política. A data de “Última atualização” no topo indica a versão vigente. Em mudanças relevantes, avisaremos de forma destacada no Serviço ou por e-mail.",
      ],
    },
  ],
};

export const PRIVACY_EN: LegalText = {
  lang: "en",
  title: "Privacy Policy (English version)",
  updated: `Last updated: ${P.dateEn}`,
  intro: [
    "This is an English version of the Portuguese Privacy Policy above, provided for convenience. It explains how Xadrez Digital (the “Service”) processes personal data under the Brazilian General Data Protection Law (Law No. 13,709/2018, “LGPD”). If the two versions differ, the Portuguese version prevails.",
    "You can use game analysis as a guest without an account. In that case your data stays on your device only (see “Cookies and on-device storage”).",
  ],
  sections: [
    {
      id: "controller",
      title: "1. Controller and contact",
      paragraphs: [
        `The data controller is ${P.company}, trading as ${P.tradeName}, CNPJ ${P.cnpj}, headquartered at ${P.address}.`,
        `Questions, data requests or contact with the data protection officer (DPO): ${P.contact}.`,
      ],
    },
    {
      id: "data",
      title: "2. Data we collect",
      items: [
        "Account data: email and password (stored only as a hash by the authentication provider, never in plain text). If you sign in with Google, we receive basic profile data you authorize, such as your email and account identifier; we never receive your Google password.",
        "Profile and permissions: one record per user with the account identifier, email and role (student or admin).",
        "Content you create: boards and analyses, imported games and PGN files, game databases and folders, notes, and bookmarked players (username and source site).",
        "Progress and preferences: progress in courses, puzzles and repertoires; Service settings (theme, pieces, engine depth, layout and site language).",
        "Technical data: IP address and request headers, handled by the hosting infrastructure and used for login rate limiting and for operational and security logs. We do not use IP addresses to build behavioral profiles.",
        "Search terms: when you search for a player or look up openings, the searched username or position is sent by our server to third-party services (section 4). We do not send your email or account identifier to them.",
      ],
      after: [
        "We do not intentionally collect sensitive personal data (LGPD art. 5, II). Avoid including sensitive data in notes or files you save to your account.",
      ],
    },
    {
      id: "purposes",
      title: "3. Purposes and legal bases (LGPD art. 7)",
      items: [
        "Create and maintain your account, authenticate you and sync your content across devices. Legal basis: performance of a contract (art. 7, V).",
        "Save your preferences, progress and language. Legal basis: performance of a contract (art. 7, V).",
        "Send transactional authentication emails (sign-up confirmation and password reset). Legal basis: performance of a contract (art. 7, V).",
        "Protect the Service against abuse and unauthorized access, including login rate limiting by IP and email. Legal basis: legitimate interest (art. 7, IX).",
        "Comply with legal or regulatory obligations and exercise rights in proceedings. Legal basis: art. 7, II and VI.",
        "Courses published by authors: a student's lesson progress is processed to show their progress (performance of a contract).",
      ],
      after: ["If we later use your data for another purpose, we will update this Policy and, where required, ask for your consent (art. 7, I)."],
    },
    {
      id: "sharing",
      title: "4. Who we share data with (processors and third parties)",
      paragraphs: ["We do not sell personal data. We use providers that process data on our behalf, or that you trigger when using the Service:"],
      items: [
        "Supabase: database and authentication (stores your account and saved content).",
        "Cloudflare: hosting and delivery network (Workers/CDN), storage of analysis-engine files (R2) and request rate limiting. It receives your IP address when handling traffic.",
        "Google: only if you choose “Continue with Google”; sign-in happens on Google's page, under Google's privacy policy.",
        "Lichess, Chess.com and FIDE: queried by our server for player, game and opening explorer lookups. They receive only the searched term (for example a username) or the position, plus our server's IP address.",
        "Embedded lesson videos (YouTube in privacy-enhanced mode and Vimeo) and board piece images (cdn.jsdelivr.net): when you open a lesson with video or export the board, your browser connects directly to these services, which receive your IP address.",
      ],
      after: [
        "We may also disclose data when required by law or a competent authority, or in aggregated form that does not identify you.",
        "We do not use advertising, audience-analytics or third-party tracking cookies or tools.",
      ],
    },
    {
      id: "transfers",
      title: "5. International transfers (LGPD art. 33)",
      paragraphs: [
        "Our providers (for example Supabase, Cloudflare and Google) may process data on servers outside Brazil. Such transfers rely on the grounds in art. 33 of the LGPD, such as performance of a contract and contractual clauses with the providers. You can request more details through the contact in section 1.",
      ],
    },
    {
      id: "retention",
      title: "6. Retention",
      paragraphs: [
        "We keep account data and saved content while your account exists. When the account is deleted, the associated content (boards, games, folders, bookmarks, progress and settings) is removed from the database, except what we must keep to comply with legal obligations or defend rights. Courses you published as an author may remain available to students, no longer linked to your account. Technical logs are kept for the period needed for security and operations, according to our infrastructure providers' settings.",
      ],
    },
    {
      id: "security",
      title: "7. Security",
      paragraphs: [
        "We adopt reasonable technical and organizational measures: encrypted connections (HTTPS), passwords stored only as hashes, row-level access control in the database so each user can only access their own data, security headers, a content security policy and login rate limiting. No system is fully secure; if an incident that may cause relevant risk or harm occurs, we will notify you and the Brazilian data protection authority (ANPD) as required by the LGPD.",
      ],
    },
    {
      id: "rights",
      title: "8. Your rights (LGPD art. 18)",
      paragraphs: ["You may, at any time and upon request:"],
      items: [
        "confirm that processing exists and access your data;",
        "correct incomplete, inaccurate or outdated data;",
        "request anonymization, blocking or deletion of unnecessary, excessive or unlawfully processed data;",
        "request data portability;",
        "request deletion of data processed on the basis of consent;",
        "obtain information about who we share your data with;",
        "be informed about the possibility of refusing consent and its consequences, and revoke consent;",
        "lodge a complaint with the ANPD.",
      ],
      after: [
        `To exercise your rights, including deleting your account and associated data, email ${P.contact} from the address registered on your account. We may ask for information to confirm your identity. We will answer within the period set by law.`,
      ],
    },
    {
      id: "cookies",
      title: "9. Cookies and on-device storage",
      paragraphs: ["The Service only uses storage essential to its operation:"],
      items: [
        "Authentication session cookies (Supabase), needed to keep you signed in.",
        "Browser localStorage: settings (including site language), panel layout, guest files and games, bookmarks, and cached course and repertoire progress.",
        "Browser IndexedDB: local cache of game reviews.",
      ],
      after: [
        "This data stays on your device and can be cleared in your browser settings (this may remove your guest data). We do not use advertising or analytics cookies.",
      ],
    },
    {
      id: "children",
      title: "10. Children and teenagers (LGPD art. 14)",
      paragraphs: [
        "Processing data of children and teenagers must be in their best interest. Users under 18 must use the Service with the knowledge and authorization of a legal guardian; for children (under 12), sign-up requires specific and prominent consent from at least one parent or guardian. If you are a guardian and believe a minor signed up without authorization, contact us so we can delete the data.",
      ],
    },
    {
      id: "changes",
      title: "11. Changes to this Policy",
      paragraphs: [
        "We may update this Policy. The “Last updated” date at the top shows the current version. For relevant changes, we will give prominent notice in the Service or by email.",
      ],
    },
  ],
};
