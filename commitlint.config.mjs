// Commit messages must follow Conventional Commits and fit on a single line.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-empty': [2, 'always'],
    'footer-empty': [2, 'always'],
  },
};
