/* ============================================================
 *  个人主页内容
 *
 *  双语文字使用 { zh: "中文", en: "English" }。
 *  暂无可靠内容的栏目使用空数组，页面会自动隐藏。
 * ============================================================ */

const SITE = {

  /* ---------------- 一、基本信息 ---------------- */
  profile: {
    siteTitle: { zh: "于浩洋 · 个人主页", en: "Haoyang Yu · Homepage" },
    description: {
      zh: "于浩洋，北京大学数学科学学院数学与应用数学专业本科生，研究兴趣为低维拓扑、纽结理论与 Floer 同调。",
      en: "Haoyang Yu is an undergraduate student in Mathematics and Applied Mathematics at Peking University, interested in low-dimensional topology, knot theory, and Floer homology."
    },
    shortName: { zh: "于浩洋", en: "Haoyang Yu" },
    eyebrow: {
      zh: "本科生 · 低维拓扑 · Floer 同调",
      en: "Undergraduate · Low-dimensional Topology · Floer Homology"
    },
    name: { zh: "于<b>浩洋</b>", en: "Haoyang <b>Yu</b>" },
    role: {
      zh: "数学与应用数学专业本科生",
      en: "Undergraduate in Mathematics and Applied Mathematics"
    },
    affiliation: {
      zh: "北京大学 数学科学学院",
      en: "School of Mathematical Sciences, Peking University"
    },
    tagline: {
      zh: "我的研究兴趣集中在低维拓扑与 Floer 同调，主要学习三维流形、纽结理论、Heegaard Floer 同调与 Monopole Floer 同调，也在探索映射类群与 Floer 理论之间的联系。",
      en: "My interests center on low-dimensional topology and Floer homology, especially 3-manifolds, knot theory, Heegaard Floer homology, and monopole Floer homology. I am also exploring connections between mapping class groups and Floer theory."
    },
    // 留空则使用内联在 index.html 里的三叶结线描图。
    // 想换成照片：把图片放进 assets/img/，这里填 "assets/img/me.jpg"。
    avatar: "",

    // 头像下方的图注。换成真人照片后把这里改成空字符串，图注会自动消失。
    avatarCaption: { zh: "图 1　三叶结 3₁（未来会被人脸替代）", en: "fig. 1 — trefoil knot 3₁ (to be replaced by a face)" },

    // 邮箱（反爬虫）：拆成三段存放，页面加载时才在浏览器里拼起来。
    // 这样源码和页面文件里都不会出现完整的 "xxx@xxx.com" 字符串，
    // 用正则扫邮箱的爬虫抓不到。想换邮箱就改这三段。
    //   ["用户名", "gmail", "com"]  →  用户名 + @ + gmail.com
    emailParts: ["yuhymath", "gmail", "com"],

    // 简历做好后：PDF 放进 assets/files/，这里填 "assets/files/CV.pdf"，
    // 首屏会自动多出一个「简历 CV」按钮。留空则按钮隐藏。
    cv: "",

    scholar: "",
    links: []
  },

  /* ---------------- 二、关于我 ---------------- */
  about: [
    {
      zh: "你好，我是于浩洋。2023 年进入<b>北京大学数学科学学院</b>，主修数学与应用数学，预计于 2027 年毕业。",
      en: "Hi, I am Haoyang Yu. I entered the <b>School of Mathematical Sciences at Peking University</b> in 2023, majoring in Mathematics and Applied Mathematics, with expected graduation in 2027."
    },
    {
      zh: "我的主要兴趣是<b>低维拓扑与 Floer 同调</b>。目前，我通过“三维流形与 Floer 同调”本科生科研立项和芝加哥大学 Mathematics REU 继续学习相关问题。",
      en: "My main interests are <b>low-dimensional topology and Floer homology</b>. I am currently pursuing these interests through an undergraduate research project on 3-manifolds and Floer homology and the University of Chicago Mathematics REU."
    }
  ],

  facts: [
    {
      k: { zh: "身份", en: "Status" },
      v: { zh: "本科生", en: "Undergraduate Student" },
      sub: { zh: "北京大学数学科学学院", en: "School of Mathematical Sciences, Peking University" }
    },
    {
      k: { zh: "专业", en: "Major" },
      v: { zh: "数学与应用数学", en: "Mathematics and Applied Mathematics" },
      sub: { zh: "2023—2027（预计）", en: "2023—2027 (expected)" }
    },
    {
      k: { zh: "研究兴趣", en: "Interests" },
      v: { zh: "低维拓扑、Floer 同调", en: "Low-dimensional Topology, Floer Homology" },
      sub: { zh: "纽结 · 三维流形 · 映射类群", en: "Knots · 3-manifolds · Mapping class groups" }
    }
  ],

  /* ---------------- 三、研究兴趣 ---------------- */
  researchLead: {
    zh: "我目前的学习和研究主要围绕以下方向展开；其中映射类群与辛 Floer 理论是正在探索的新方向。",
    en: "My current study and research revolve around the following themes; mapping class groups and symplectic Floer theory are newer directions I am actively exploring."
  },

  research: [
    {
      title: { zh: "低维拓扑与纽结理论", en: "Low-dimensional Topology & Knot Theory" },
      desc: {
        zh: "关注纽结、三维流形及其拓扑不变量之间的联系，并学习低维拓扑中连接几何、拓扑与代数结构的方法。",
        en: "I am interested in relationships among knots, 3-manifolds, and their topological invariants, and in the ways low-dimensional topology connects geometric, topological, and algebraic structures."
      },
      tags: [
        { zh: "低维拓扑", en: "Low-dimensional Topology" },
        { zh: "纽结", en: "Knots" },
        { zh: "三维流形", en: "3-Manifolds" }
      ]
    },
    {
      title: {
        zh: "Heegaard Floer 与 Monopole Floer 同调",
        en: "Heegaard Floer & Monopole Floer Homology"
      },
      desc: {
        zh: "学习 Heegaard Floer 同调与 Monopole Floer 同调，以及它们在三维流形拓扑中的结构与应用。",
        en: "I study Heegaard Floer homology and monopole Floer homology, together with their structures and applications in 3-manifold topology."
      },
      tags: [
        { zh: "Heegaard Floer", en: "Heegaard Floer" },
        { zh: "Monopole Floer", en: "Monopole Floer" }
      ]
    },
    {
      title: { zh: "映射类群与辛 Floer 理论", en: "Mapping Class Groups & Symplectic Floer Theory" },
      desc: {
        zh: "近期正在探索曲面微分同胚的辛 Floer 同调、Torelli 群与 Johnson filtration，以及映射环面和 Floer 理论之间的联系。",
        en: "I am currently exploring symplectic Floer homology of surface diffeomorphisms, Torelli groups and the Johnson filtration, and connections between mapping tori and Floer theories."
      },
      tags: [
        { zh: "映射类群", en: "Mapping Class Groups" },
        { zh: "Torelli 群", en: "Torelli Groups" },
        { zh: "辛 Floer", en: "Symplectic Floer" }
      ]
    }
  ],

  /* ---------------- 四、项目 ---------------- */
  // 自己写的程序。links 里的地址相对于主页根目录；
  // 想加新程序，把它的文件夹放进主页目录，再在这里添一条即可。
  worksLead: {
    zh: "自己写的交互程序，都是零依赖的静态页面，点开就在浏览器里跑。",
    en: "Interactive programs I wrote, each a dependency-free static page that runs directly in the browser."
  },

  works: [
    {
      when: { zh: "2026", en: "2026" },
      kind: { zh: "交互式可视化", en: "Interactive Visualization" },
      title: { zh: "纽结同痕可视化", en: "Knot Isotopy Explorer" },
      desc: {
        zh: "拖动空间纽结上的任意控制点，程序用 PL 纽结论里的 <b>Δ-move</b> 判定保证形变全程不出现自交，同时实时画出对应的二维投影图解，并识别其间发生的 <b>Reidemeister 移动</b>。每一帧还用 Wirtinger 表示和 Fox 微分重算一次 <b>Alexander 多项式</b>，用来校验形变确实没有改变纽结型。",
        en: "Drag any control point of a knot in space: a <b>Δ-move</b> test from PL knot theory keeps the deformation embedded at every instant, while the corresponding planar diagram is redrawn live and the <b>Reidemeister moves</b> along the way are identified. Each frame also recomputes the <b>Alexander polynomial</b> from the Wirtinger presentation via Fox calculus, as a check that the deformation has not changed the knot type."
      },
      tags: [
        { zh: "Δ-move", en: "Δ-move" },
        { zh: "Reidemeister 移动", en: "Reidemeister Moves" },
        { zh: "Alexander 多项式", en: "Alexander Polynomial" }
      ],
      links: [
        { label: { zh: "打开演示", en: "Open the demo" }, url: "knot/index.html" }
      ]
    },
    {
      when: { zh: "2026", en: "2026" },
      kind: { zh: "交互式可视化", en: "Interactive Visualization" },
      title: { zh: "从投影图还原纽结", en: "Lifting a Knot from Its Diagram" },
      desc: {
        zh: "该程序从平面纽结图解构造其三维实现。用户首先将一条平面闭曲线变形为带有横截交点的<b>影子图</b>，并为每个交叉点指定上下穿信息；程序据此构造空间中的一条嵌入折线，使其正交投影与给定图解一致。随后，程序在 Δ-move 条件的约束下对空间折线进行松弛，从而保持纽结型不变。对于交叉点不超过 12 个的影子图，程序还可遍历全部 2ⁿ 种上下穿指派，并依据 <b>Alexander 多项式</b>对所得图解进行分组。",
        en: "This program constructs a spatial realization of a planar knot diagram. The user first deforms a closed plane curve into a <b>shadow</b> with transverse double points and then assigns over/under information at each crossing. From these data, the program constructs an embedded polygonal curve in three-space whose orthogonal projection agrees with the prescribed diagram. It then relaxes the spatial curve under a Δ-move constraint, preserving the knot type. For shadows with at most 12 crossings, the program can enumerate all 2ⁿ over/under assignments and group the resulting diagrams by their <b>Alexander polynomials</b>."
      },
      tags: [
        { zh: "纽结图解", en: "Knot Diagrams" },
        { zh: "空间提升", en: "Spatial Lifting" },
        { zh: "Alexander 多项式", en: "Alexander Polynomial" }
      ],
      links: [
        { label: { zh: "打开演示", en: "Open the demo" }, url: "knot/lift.html" }
      ]
    }
  ],

  /* ---------------- 五、研究经历 ---------------- */
  // 按时间倒序排列，最近的放最前面。
  // status 填 "ongoing" 会在卡片上显示一个「进行中」的呼吸圆点，不需要就删掉这一行。
  projects: [
    {
      status: "ongoing",
      when: { zh: "2026.06—2026.08", en: "Jun—Aug 2026" },
      kind: { zh: "Mathematics REU", en: "Mathematics REU" },
      title: { zh: "芝加哥大学 Mathematics REU", en: "University of Chicago Mathematics REU" },
      desc: {
        zh: "参加芝加哥大学 2026 Mathematics REU，在暑期开展独立研究并完成结项论文。",
        en: "Participant in the University of Chicago 2026 Mathematics REU, carrying out independent summer research culminating in a final paper."
      },
      tags: [
        { zh: "暑期研究", en: "Summer Research" },
        { zh: "REU", en: "REU" }
      ],
      // 结项论文完成后填这两项，卡片上会自动出现「项目成果」和论文入口。
      paper: "",
      paperTitle: { zh: "", en: "" }
    },
    {
      status: "ongoing",
      when: { zh: "2025.09—至今", en: "Sep 2025—Present" },
      kind: { zh: "本科生科研立项", en: "Undergraduate Research Project" },
      title: { zh: "三维流形与 Floer 同调", en: "3-Manifolds and Floer Homology" },
      desc: {
        zh: "在王家军老师指导下开展本科生科研立项，学习 Morse 同调、Heegaard Floer 同调、Monopole Floer 同调与三维流形拓扑。",
        en: "An undergraduate research project under the guidance of Prof. Jiajun Wang, studying Morse homology, Heegaard Floer homology, monopole Floer homology, and 3-manifold topology."
      },
      tags: [
        { zh: "三维流形", en: "3-Manifolds" },
        { zh: "Floer 同调", en: "Floer Homology" }
      ],
      paper: "",
      paperTitle: { zh: "", en: "" }
    }
  ],

  /* ---------------- 六、论文与预印本 ---------------- */
  // 暂无经核实的公开论文，栏目自动隐藏。
  publications: [],

  /* ---------------- 七、荣誉与奖项 ---------------- */
  // 按年份倒序自动排列，不需要手动调整顺序。
  experience: [
    {
      when: { zh: "2022", en: "2022" },
      what: { zh: "中国数学奥林匹克 金牌", en: "Gold Medal, Chinese Mathematical Olympiad" },
      where: { zh: "第 38 届 CMO", en: "38th CMO" }
    },
    {
      when: { zh: "2026", en: "2026" },
      what: { zh: "丘成桐大学生数学竞赛 几何与拓扑方向笔试第 8 名", en: "8th Place, Geometry & Topology Written Exam" },
      where: { zh: "丘成桐大学生数学竞赛", en: "Yau College Student Mathematics Contest" }
    },
    {
      when: { zh: "2025", en: "2025" },
      what: {
        zh: "全国大学生数学竞赛 数学专业甲组北京市一等奖",
        en: "Beijing First Prize, National College Student Mathematics Competition (Mathematics, Group A)"
      },
      where: { zh: "", en: "" }
    },
    {
      when: { zh: "2025", en: "2025" },
      what: {
        zh: "丘成桐大学生数学竞赛 几何与拓扑方向笔试优胜奖",
        en: "Written Exam Distinction in Geometry & Topology, Yau College Student Mathematics Contest"
      },
      where: { zh: "", en: "" }
    },
    {
      when: { zh: "2025", en: "2025" },
      what: { zh: "北京大学三好学生", en: "Merit Student of Peking University" },
      where: { zh: "", en: "" }
    }
  ],

  /* ---------------- 八、随笔 / 博客 ---------------- */
  // 尚未提供可公开访问的文章链接，栏目自动隐藏。
  notes: [],

  /* ---------------- 九、联系 ---------------- */
  contactLead: {
    zh: "欢迎就数学学习与研究问题与我交流。",
    en: "I welcome conversations about learning and research in mathematics."
  },

  footer: {
    owner: { zh: "于浩洋", en: "Haoyang Yu" },
    note: {
      zh: "使用 HTML、CSS 与 JavaScript 构建",
      en: "Built with HTML, CSS & JavaScript"
    }
  }
};


/* ============================================================
 *  界面固定文字
 * ============================================================ */
const UI = {
  navAbout:        { zh: "关于",       en: "About" },
  navResearch:     { zh: "研究兴趣",   en: "Research" },
  navWorks:        { zh: "项目",       en: "Projects" },
  navProjects:     { zh: "研究经历",   en: "Research Experience" },
  navExperience:   { zh: "荣誉与奖项", en: "Honors & Awards" },
  navPublications: { zh: "论文",       en: "Publications" },
  navNotes:        { zh: "随笔",       en: "Notes" },
  navContact:      { zh: "联系",       en: "Contact" },

  secAbout:        { zh: "关于我",       en: "About" },
  secResearch:     { zh: "研究兴趣",     en: "Research Interests" },
  secWorks:        { zh: "项目",         en: "Projects" },
  secProjects:     { zh: "研究经历",     en: "Research Experience" },
  secExperience:   { zh: "荣誉与奖项",   en: "Honors & Awards" },
  secPublications: { zh: "论文与预印本", en: "Publications" },
  secNotes:        { zh: "随笔",         en: "Notes" },
  secContact:      { zh: "联系我",       en: "Get in Touch" },

  viewResearch:    { zh: "查看研究兴趣", en: "Explore my interests" },
  contactMe:       { zh: "联系我",       en: "Get in touch" },
  cv:              { zh: "简历 CV",      en: "Curriculum Vitae" },
  fullList:        { zh: "完整列表 →",   en: "Full list →" },

  ongoing:         { zh: "进行中",       en: "Ongoing" },
  copyEmail:       { zh: "复制",         en: "Copy" },
  copied:          { zh: "已复制",       en: "Copied" },

  filterAll:        { zh: "全部",   en: "All" },
  filterJournal:    { zh: "期刊",   en: "Journal" },
  filterConference: { zh: "会议",   en: "Conference" },
  filterPreprint:   { zh: "预印本", en: "Preprint" },

  typeJournal:      { zh: "期刊",   en: "Journal" },
  typeConference:   { zh: "会议",   en: "Conference" },
  typePreprint:     { zh: "预印本", en: "Preprint" },

  projectOutput:    { zh: "项目成果", en: "Project Output" },
  viewPaper:        { zh: "查看论文 ↗", en: "View Paper ↗" },

  openWork:         { zh: "打开 ↗",   en: "Open ↗" }
};
