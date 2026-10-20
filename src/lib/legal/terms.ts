// SIG-1057: Terms of Use text. Draft pending legal review.
import { LEGAL_PLACEHOLDERS as P, type LegalText } from "./config";

export const TERMS_PT: LegalText = {
  lang: "pt-BR",
  title: "Termos de Uso",
  updated: `Última atualização: ${P.date}`,
  intro: [
    `Estes Termos regem o uso do Xadrez Digital (o “Serviço”), oferecido por ${P.company}, CNPJ ${P.cnpj}, com sede em ${P.address}. Ao criar uma conta ou usar o Serviço, você declara que leu e concorda com estes Termos e com a Política de Privacidade.`,
  ],
  sections: [
    {
      id: "servico",
      title: "1. O Serviço",
      paragraphs: [
        "O Xadrez Digital é uma plataforma web de estudo de xadrez: estúdio de análise com tabuleiro e motor de xadrez no navegador, explorador de aberturas, importação e exportação de partidas em PGN, repertórios, exercícios (puzzles) e cursos. Parte dos recursos funciona sem conta (modo visitante); outros exigem cadastro, como a sincronização do seu conteúdo entre dispositivos.",
        "Podemos criar, alterar, limitar ou descontinuar recursos. No futuro, o Serviço poderá incluir cursos de autores terceiros, bem como cursos ou assinaturas pagos; nesse caso, as condições comerciais serão informadas antes da contratação.",
      ],
    },
    {
      id: "conta",
      title: "2. Elegibilidade e conta",
      items: [
        "Você deve ter capacidade para contratar. Menores de 18 anos devem usar o Serviço com ciência e autorização de um responsável legal (veja a Política de Privacidade).",
        "Forneça informações verdadeiras e mantenha seu e-mail e senha sob sigilo. Você é responsável pelas atividades realizadas na sua conta.",
        "Avise-nos se suspeitar de uso não autorizado da sua conta.",
      ],
    },
    {
      id: "uso",
      title: "3. Uso aceitável",
      paragraphs: ["Você concorda em não:"],
      items: [
        "violar leis ou direitos de terceiros;",
        "tentar acessar contas, dados ou sistemas sem autorização, ou contornar limites de segurança e de uso (como limites de tentativas e de requisições);",
        "sobrecarregar, interferir no Serviço ou fazer extração automatizada em massa de conteúdo e das interfaces de consulta;",
        "enviar malware ou conteúdo ilícito, ofensivo ou que viole direitos autorais;",
        "usar o Serviço para trapacear em partidas ou competições em andamento nas quais o uso de motores de xadrez ou de ajuda externa seja proibido.",
      ],
    },
    {
      id: "conteudo",
      title: "4. Seu conteúdo e licença",
      paragraphs: [
        "Você mantém a titularidade do conteúdo que cria ou envia (por exemplo partidas, PGN, anotações e repertórios). Você nos concede uma licença limitada, não exclusiva, para armazenar, processar e exibir esse conteúdo somente na medida necessária para operar o Serviço para você (inclusive sincronizar e fazer cópias de segurança).",
        "Você declara ter os direitos necessários sobre o conteúdo que envia e é responsável por ele.",
      ],
    },
    {
      id: "cursos",
      title: "5. Cursos de autores terceiros",
      paragraphs: [
        "Cursos podem ser criados e publicados por autores. O autor é responsável pelo conteúdo do próprio curso e pelos direitos sobre ele. Poderemos remover ou suspender conteúdo que viole estes Termos ou a lei. Regras específicas sobre cursos pagos, assinaturas, pagamentos e reembolsos, se e quando existirem, serão apresentadas antes da contratação e farão parte destes Termos.",
      ],
    },
    {
      id: "pi",
      title: "6. Propriedade intelectual",
      paragraphs: [
        "O Serviço, sua marca, interface e código pertencem ao controlador ou a seus licenciantes e são protegidos pela legislação aplicável. Estes Termos não transferem a você nenhum direito além do uso do Serviço conforme aqui descrito. Componentes de código aberto, como o motor de xadrez, seguem suas respectivas licenças.",
      ],
    },
    {
      id: "terceiros",
      title: "7. Serviços de terceiros",
      paragraphs: [
        "O Serviço usa ou consulta serviços de terceiros, como Supabase, Cloudflare, Google (login), Lichess, Chess.com, FIDE, YouTube e Vimeo. Esses serviços têm termos e políticas próprios, e não somos responsáveis por sua disponibilidade, exatidão ou conteúdo. Dados de jogadores, partidas e aberturas provenientes desses serviços pertencem às respectivas fontes.",
      ],
    },
    {
      id: "isencao",
      title: "8. Isenção de garantias",
      paragraphs: [
        "O Serviço é fornecido “no estado em que se encontra” e conforme a disponibilidade. A análise do motor de xadrez, as avaliações, as classificações de lances e as explicações são ferramentas de estudo, podem conter imprecisões e não garantem resultados em partidas ou competições. Não garantimos que o Serviço será ininterrupto ou livre de erros. Mantenha cópia dos seus arquivos importantes (você pode exportar em PGN).",
      ],
    },
    {
      id: "responsabilidade",
      title: "9. Limitação de responsabilidade",
      paragraphs: [
        "Na máxima extensão permitida pela lei, não respondemos por danos indiretos, lucros cessantes ou perda de dados decorrentes do uso ou da impossibilidade de uso do Serviço, e nossa responsabilidade total fica limitada ao valor que você tenha pago pelo Serviço nos 12 meses anteriores ao evento (ou, se o uso for gratuito, a um valor simbólico). Nada nestes Termos exclui direitos que a lei, inclusive o Código de Defesa do Consumidor, não permita limitar.",
      ],
    },
    {
      id: "encerramento",
      title: "10. Suspensão e encerramento",
      paragraphs: [
        "Você pode parar de usar o Serviço e solicitar a exclusão da sua conta a qualquer momento (veja a Política de Privacidade). Podemos suspender ou encerrar contas que violem estes Termos ou a lei, ou para proteger o Serviço e outros usuários, quando possível com aviso prévio.",
      ],
    },
    {
      id: "alteracoes",
      title: "11. Alterações destes Termos",
      paragraphs: [
        "Podemos alterar estes Termos. A data de “Última atualização” indica a versão vigente. Em mudanças relevantes, avisaremos no Serviço ou por e-mail; continuar a usar o Serviço após a vigência da nova versão indica concordância, sem prejuízo dos seus direitos legais.",
      ],
    },
    {
      id: "lei",
      title: "12. Lei aplicável e foro",
      paragraphs: [
        `Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de ${P.forum} para dirimir controvérsias, ressalvado o foro do domicílio do consumidor quando a lei assim determinar.`,
      ],
    },
    {
      id: "contato",
      title: "13. Contato",
      paragraphs: [`Dúvidas sobre estes Termos: ${P.contact}.`],
    },
  ],
};

export const TERMS_EN: LegalText = {
  lang: "en",
  title: "Terms of Use (English version)",
  updated: `Last updated: ${P.date}`,
  intro: [
    `This is an English version of the Portuguese Terms of Use above, provided for convenience; if they differ, the Portuguese version prevails. These Terms govern use of Xadrez Digital (the “Service”), offered by ${P.company}, CNPJ ${P.cnpj}, headquartered at ${P.address}. By creating an account or using the Service you confirm that you have read and agree to these Terms and the Privacy Policy.`,
  ],
  sections: [
    {
      id: "service",
      title: "1. The Service",
      paragraphs: [
        "Xadrez Digital is a web platform for studying chess: an analysis studio with a board and an in-browser chess engine, an opening explorer, PGN import and export, repertoires, puzzles and courses. Some features work without an account (guest mode); others require sign-up, such as syncing your content across devices.",
        "We may add, change, limit or discontinue features. In the future the Service may include courses by third-party authors, as well as paid courses or subscriptions; in that case the commercial terms will be shown before you purchase.",
      ],
    },
    {
      id: "account",
      title: "2. Eligibility and account",
      items: [
        "You must have legal capacity to enter into a contract. Users under 18 must use the Service with the knowledge and authorization of a legal guardian (see the Privacy Policy).",
        "Provide truthful information and keep your email and password confidential. You are responsible for activity on your account.",
        "Tell us if you suspect unauthorized use of your account.",
      ],
    },
    {
      id: "use",
      title: "3. Acceptable use",
      paragraphs: ["You agree not to:"],
      items: [
        "violate laws or third-party rights;",
        "attempt to access accounts, data or systems without authorization, or bypass security and usage limits (such as rate limits);",
        "overload or interfere with the Service, or scrape content and lookup interfaces in bulk;",
        "upload malware or unlawful, offensive or infringing content;",
        "use the Service to cheat in ongoing games or competitions where engines or outside help are prohibited.",
      ],
    },
    {
      id: "content",
      title: "4. Your content and license",
      paragraphs: [
        "You keep ownership of the content you create or upload (for example games, PGN, notes and repertoires). You grant us a limited, non-exclusive license to store, process and display that content only as needed to operate the Service for you (including syncing and backups).",
        "You confirm you have the necessary rights to the content you upload and are responsible for it.",
      ],
    },
    {
      id: "courses",
      title: "5. Courses by third-party authors",
      paragraphs: [
        "Courses may be created and published by authors. The author is responsible for their own course content and rights. We may remove or suspend content that violates these Terms or the law. Specific rules on paid courses, subscriptions, payments and refunds, if and when they exist, will be presented before purchase and will form part of these Terms.",
      ],
    },
    {
      id: "ip",
      title: "6. Intellectual property",
      paragraphs: [
        "The Service, its brand, interface and code belong to the controller or its licensors and are protected by applicable law. These Terms grant you no rights beyond using the Service as described. Open-source components, such as the chess engine, follow their own licenses.",
      ],
    },
    {
      id: "third-parties",
      title: "7. Third-party services",
      paragraphs: [
        "The Service uses or queries third-party services such as Supabase, Cloudflare, Google (sign-in), Lichess, Chess.com, FIDE, YouTube and Vimeo. They have their own terms and policies, and we are not responsible for their availability, accuracy or content. Player, game and opening data from those services belongs to the respective sources.",
      ],
    },
    {
      id: "disclaimer",
      title: "8. Disclaimer",
      paragraphs: [
        "The Service is provided “as is” and as available. Engine analysis, evaluations, move classifications and explanations are study tools, may contain inaccuracies and do not guarantee results in games or competitions. We do not guarantee the Service will be uninterrupted or error-free. Keep copies of your important files (you can export PGN).",
      ],
    },
    {
      id: "liability",
      title: "9. Limitation of liability",
      paragraphs: [
        "To the maximum extent permitted by law, we are not liable for indirect damages, lost profits or data loss arising from use of, or inability to use, the Service, and our total liability is limited to the amount you paid for the Service in the 12 months before the event (or, if use is free, a nominal amount). Nothing in these Terms excludes rights that the law, including the Brazilian Consumer Protection Code, does not allow to be limited.",
      ],
    },
    {
      id: "termination",
      title: "10. Suspension and termination",
      paragraphs: [
        "You may stop using the Service and request deletion of your account at any time (see the Privacy Policy). We may suspend or terminate accounts that violate these Terms or the law, or to protect the Service and other users, with prior notice where possible.",
      ],
    },
    {
      id: "changes",
      title: "11. Changes to these Terms",
      paragraphs: [
        "We may change these Terms. The “Last updated” date shows the current version. For relevant changes we will give notice in the Service or by email; continuing to use the Service after the new version takes effect indicates agreement, without prejudice to your legal rights.",
      ],
    },
    {
      id: "law",
      title: "12. Governing law and venue",
      paragraphs: [
        `These Terms are governed by the laws of the Federative Republic of Brazil. The courts of the district of ${P.forum} are chosen to settle disputes, except where the law gives the consumer the right to sue in their own domicile.`,
      ],
    },
    {
      id: "contact",
      title: "13. Contact",
      paragraphs: [`Questions about these Terms: ${P.contact}.`],
    },
  ],
};
