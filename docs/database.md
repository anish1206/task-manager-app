# SQl vs NoSQL

My application has highly relational and structured data. 
The schema is stable and soes not change, so a relational database like PostgreSQL feels natural which provides strong integrity, ACID guarantees, indexing, and efficient relational querying.


> ### ACID Properties
> 
> - **Atomicity** - transactio ntakes place completed, or it does not ever take place
> 
> - **Consistency** - data is consistent everywhere
> 
> - **Isolation** - all transaction occurs independently
> 
> - **Durablity** - successful changes are perminant/durable
---

NoSQL could also have worked in this case if
- The schema of taks would have been more flexiable. Like currently it has fixed structure but let say it would have more flexiable stured like some taks have images or videos or other columns 
- If we consider more users, i.e. horizontal scaling
---