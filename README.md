# High Level Architecture design

**WatchAPI Client 2**
**0.1**

**MVP**
**21/12/2025**

### Overview:

Provide VS Code developers ability to manage APIs inside vs code. Ability to upload their current Next.js or Next.js with trpc project into collections and endpoints. And be in Sync with WatchAPI cloud.

### Objectives:

It allows developers to sync their Next.js project directly from code to APIs dashboard and cloud.
This docs will explain the high level design of the extension covering main functionalities.

### Table Of Content:

### Visibility - Activity Bar / Command Palette:

Activity Bar:
WatchAPI logo of watch
Command Palette:

- Refresh
- Login
- Logout
- Focus collection view
- Open dashboard

### Sidebar

Title: WatchAPI
Right side actions:

- Always first (for visibility): Exclamation mark visible only if 'REST Client' extension not avalible
- Plus icon: adds collection to the end of the list, but before asks the name.
- Upload icon: appear only when project type is supported: next-app / next-trpc on click go over endpoints and show modal to submit:
  - Modal item have method type, api route and file path
  - On submit it adds this endpoints to user collections collections been grouped.
- Refresh icon: pulling endpoints from cloud.
- Always last menu (3 dots):
  - Login redirect to login guest session. (if not logged in)
  - Logout clearing token: (if logged in)

### Collection section - Tree items

Collections are folders and endpoints items, virtual items to make them hidden from disc.
**Collection:**

- name: CRUD operation name like: auth, endpoints, users.
- description: number of endpoints: x endpoint/s
- icon: layers
- operation icon: Plus to add endpoint

**Endpoints:**

- name: operation name like: Create user, Update endpoints
- description: method name like: POST, GET

### File editor - .http format

- on read construct endpoint to .http format
- on save parse .http to endpoint format
- environments been added to the top on read

### tRPC API client

- crud collections /api/trpc/
- crud api-endpoints /api/trpc/
- crud environments /api/trpc/
