-- Optional sample event. Run once after the migration. Starts one hour from execution.
with new_game as (
 insert into public.games(place,area,tag,meeting,starts_at)
 values('Central Park','Manhattan, New York','A little nature. A lot of adventure.','Bethesda Fountain · south steps',now()+interval '1 hour') returning id
)
insert into public.tasks(game_id,title,description,kind,position)
select g.id,t.* from new_game g cross join (values
 ('Birds of a feather','Spot a bird and snap a photo of your feathered new friend.','WILDLIFE',1),
 ('Find something unexpected','Find a piece of public art. Recreate its pose with your team.','DISCOVERY',2),
 ('A team with a view','Get your whole team in a photo with a great view behind you.','TEAMWORK',3),
 ('The color hunt','Find three things in your team color and photograph them together.','EXPLORATION',4)
) t(title,description,kind,position);
