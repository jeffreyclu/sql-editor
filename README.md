## Setup

- Requires Docker and Docker Compose
- Requires Node 20+

`docker compose up -d`
`npm i`

## Start the application

`npm run start`

See `requests.http` for API usage examples.

## Work Assignment

Given the current project, let's implement a small SQL web editor using React. When opening `/`, the React application should render and display a SQL editor where users can write and execute SQL queries.

The goal is to demonstrate how you structure a front-end application, handle data flow and asynchronous interactions.

Please implement the following features:
- Run a query and display the query results in the UI
- Support running multi-statement SQL scripts and display their results
- Bonus: Insert data from a file

## Notes

- We encourage you to make this your own: feel free to add small improvements, extra features, or UX enhancements that you think are valuable.
- You may introduce any third-party dependencies you find useful.
- We have our [UI component library](https://click-ui.vercel.app) if you want help with component design or faster scaffolding, but you are free to use whatever tools or libraries you prefer.
- You are welcome to use AI-assisted tools (e.g., Claude, Copilot, Cursor, etc.) as part of your workflow. If you do, please be prepared to explain your solution and the decisions you made.
- Focus on clarity, code quality, and reasonable structure rather than pixel-perfect styling.

## Evaluation Criteria

We will primarily look at:
- Code organization and overall architecture
- Readability and maintainability
- Component design and state management approach
- Handling of async flows, loading states, and errors
- Basic UX considerations and usability
- Thoughtfulness in trade-offs and decisions
