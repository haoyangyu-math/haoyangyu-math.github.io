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
    // 左上角标志：TeX 风格的 \mathbb{Y}u，中英文相同。
    // <span class="bb"> 里的字母用黑板粗体，其余用 TeX 正文字体。
    brand: '<span class="bb">Y</span>u',
    name: { zh: "于<b>浩洋</b>", en: "Haoyang <b>Yu</b>" },
    role: {
      zh: "数学与应用数学专业本科生 · 2027 年毕业",
      en: "Undergraduate in Mathematics and Applied Mathematics · Class of 2027"
    },
    affiliation: {
      zh: "北京大学 数学科学学院",
      en: "School of Mathematical Sciences, Peking University"
    },
    // 首屏一句话简介；具体方向写在「研究兴趣」栏目里，这里不再展开。
    tagline: {
      zh: "研究兴趣是低维拓扑与 Floer 同调。",
      en: "I am interested in low-dimensional topology and Floer homology."
    },
    // 首屏照片。换照片时替换 assets/img/me.jpg，并把 ?v= 改成新文件的
    // SHA-256 前 12 位，访客就不会看到缓存里的旧照片；index.html 里的 <img> 同步改。
    avatar: "assets/img/me.jpg?v=3a7ee2d0024d",

    // 照片下方的图注，留空则不显示。
    avatarCaption: { zh: "", en: "" },

    // 邮箱（反爬虫）：拆成三段存放，页面加载时才在浏览器里拼起来。
    // 这样源码和页面文件里都不会出现完整的 "xxx@xxx.com" 字符串，
    // 用正则扫邮箱的爬虫抓不到。想换邮箱就改这三段。
    //   ["用户名", "gmail", "com"]  →  用户名 + @ + gmail.com
    emailParts: ["yuhymath", "gmail", "com"],

    // 公开版学术简历；首屏的「简历 CV」按钮会在新标签页打开它。
    cv: "assets/files/Haoyang_Yu_CV.pdf?v=18957e2f6131",

    scholar: "",
    links: []
  },

  /* ---------------- 二、关于我 ---------------- */
  // 身份、专业、毕业年份已在首屏，研究兴趣和经历各有栏目，
  // 为避免重复，这一栏目前留空（页面自动隐藏）。
  about: [],
  facts: [],

  /* ---------------- 三、研究兴趣 ---------------- */
  // 栏目引言，留空则不显示。
  researchLead: { zh: "", en: "" },

  research: [
    { title: { zh: "低维拓扑与纽结理论", en: "Low-dimensional Topology & Knot Theory" } },
    {
      title: {
        zh: "Heegaard Floer 与 Monopole Floer 同调",
        en: "Heegaard Floer & Monopole Floer Homology"
      }
    }
  ],

  /* ---------------- 四、项目 ---------------- */
  // 借助 Claude 生成的程序。links 里的地址相对于主页根目录；
  // 想加新程序，把它的文件夹放进主页目录，再在这里添一条即可。
  worksLead: {
    zh: "借助 Claude 生成的交互程序。",
    en: "Interactive programs generated with the help of Claude."
  },

  works: [
    {
      title: { zh: "纽结同痕可视化", en: "Knot Isotopy Explorer" },
      links: [
        { label: { zh: "打开演示", en: "Open the demo" }, url: "knot/index.html" }
      ]
    },
    {
      title: { zh: "从投影图还原纽结", en: "Lifting a Knot from Its Diagram" },
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
      when: { zh: "2026.06—2026.08", en: "Jun—Aug 2026" },
      title: { zh: "芝加哥大学 Mathematics REU", en: "University of Chicago Mathematics REU" },
      // 导师；url 留空则只显示名字。
      mentor: {
        name: { zh: "Daniel Minahan", en: "Daniel Minahan" },
        url: "https://math.uchicago.edu/~dminahan/"
      },
      // 结项论文公开后填这两项，卡片上会自动出现「项目成果」和论文入口。
      paper: "",
      paperTitle: { zh: "", en: "" }
    },
    {
      when: { zh: "2025.09—2026.11", en: "Sep 2025—Nov 2026" },
      title: { zh: "本科生科研立项", en: "Undergraduate Research Project" },
      mentor: {
        name: { zh: "王家军 教授", en: "Prof. Jiajun Wang" },
        url: "https://math.pku.edu.cn/teachers/wangjj/"
      },
      paper: "",
      paperTitle: { zh: "", en: "" }
    }
  ],

  /* ---------------- 六、论文与预印本 ---------------- */
  // 还没有论文时显示 publicationsEmpty 这句话；填了论文就自动换成列表。
  publications: [],
  publicationsEmpty: { zh: "会有的会有的🥲", en: "It'll come, it'll come 🥲" },

  /* ---------------- 七、荣誉与奖项 ---------------- */
  // 按年份倒序自动排列，不需要手动调整顺序。
  experience: [
    {
      when: { zh: "2022", en: "2022" },
      what: { zh: "金牌", en: "Gold Medal" },
      where: { zh: "第 38 届中国数学奥林匹克（CMO）", en: "38th Chinese Mathematical Olympiad (CMO)" }
    },
    {
      when: { zh: "2026", en: "2026" },
      what: { zh: "国家奖学金", en: "National Scholarship" },
      where: { zh: "北京大学", en: "Peking University" }
    },
    {
      when: { zh: "2026", en: "2026" },
      what: { zh: "九坤数学英才奖学金", en: "Ubiquant Mathematics Talent Scholarship" },
      where: { zh: "北京大学", en: "Peking University" }
    },
    {
      when: { zh: "2026", en: "2026" },
      what: { zh: "几何与拓扑方向笔试第 8 名", en: "8th Place, Geometry & Topology Written Exam" },
      where: { zh: "丘成桐大学生数学竞赛", en: "Yau College Student Mathematics Contest" }
    },
    {
      when: { zh: "2025", en: "2025" },
      what: {
        zh: "数学专业甲组北京市一等奖",
        en: "Beijing First Prize, Mathematics (Group A)"
      },
      where: { zh: "全国大学生数学竞赛", en: "National College Student Mathematics Competition" }
    },
    {
      when: { zh: "2025", en: "2025" },
      what: {
        zh: "几何与拓扑方向笔试优胜奖",
        en: "Written Exam Distinction in Geometry & Topology"
      },
      where: { zh: "丘成桐大学生数学竞赛", en: "Yau College Student Mathematics Contest" }
    },
    {
      when: { zh: "2025, 2026", en: "2025, 2026" },
      what: { zh: "三好学生", en: "Merit Student" },
      where: { zh: "北京大学", en: "Peking University" }
    },
    {
      when: { zh: "2025", en: "2025" },
      what: { zh: "秦宛顺靳云汇奖学金", en: "Qin Wanshun–Jin Yunhui Scholarship" },
      where: { zh: "北京大学", en: "Peking University" }
    }
  ],

  /* ---------------- 八、随笔 / 博客 ---------------- */
  // 尚未提供可公开访问的文章链接，栏目自动隐藏。
  notes: [],


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

  secAbout:        { zh: "关于我",       en: "About" },
  secResearch:     { zh: "研究兴趣",     en: "Research Interests" },
  secWorks:        { zh: "项目",         en: "Projects" },
  secProjects:     { zh: "研究经历",     en: "Research Experience" },
  secExperience:   { zh: "荣誉与奖项",   en: "Honors & Awards" },
  secPublications: { zh: "论文与预印本", en: "Publications" },
  secNotes:        { zh: "随笔",         en: "Notes" },

  viewResearch:    { zh: "查看研究兴趣", en: "Explore my interests" },
  cv:              { zh: "简历 CV",      en: "Curriculum Vitae" },
  fullList:        { zh: "完整列表 →",   en: "Full list →" },

  ongoing:         { zh: "进行中",       en: "Ongoing" },

  filterAll:        { zh: "全部",   en: "All" },
  filterJournal:    { zh: "期刊",   en: "Journal" },
  filterConference: { zh: "会议",   en: "Conference" },
  filterPreprint:   { zh: "预印本", en: "Preprint" },

  typeJournal:      { zh: "期刊",   en: "Journal" },
  typeConference:   { zh: "会议",   en: "Conference" },
  typePreprint:     { zh: "预印本", en: "Preprint" },

  mentor:           { zh: "导师", en: "Mentor" },
  projectOutput:    { zh: "项目成果", en: "Project Output" },
  viewPaper:        { zh: "查看论文 ↗", en: "View Paper ↗" },

  openWork:         { zh: "打开 ↗",   en: "Open ↗" }
};
